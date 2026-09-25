import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * Gecko-only feed of the dune frame for the glass layer. Uploading the dune
 * canvas into another context is a blocking GPU→CPU readback there (~15 MB
 * per frame at 1.5 dpr), so instead this context resolves and downsamples its
 * own frame to 1/4 size on the GPU and reads it back asynchronously through a
 * pixel buffer + fence. Rows are bottom-up and premultiplied.
 */

export type DuneSnapshot = { data: Uint8Array; w: number; h: number; version: number }

let snapshot: DuneSnapshot | null = null

export function latestDuneSnapshot() {
  return snapshot
}

const HALVINGS = 2

type Level = { fb: WebGLFramebuffer; rb: WebGLRenderbuffer; w: number; h: number }

type Pending = { pbo: WebGLBuffer; sync: WebGLSync | null; w: number; h: number }

class Capture {
  private gl: WebGL2RenderingContext
  private levels: Level[] = []
  private srcW = 0
  private srcH = 0
  private slots: Pending[] = []
  private next = 0
  private version = 0

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    for (let i = 0; i < 2; i++) {
      const pbo = gl.createBuffer()
      if (pbo) this.slots.push({ pbo, sync: null, w: 0, h: 0 })
    }
  }

  private ensureLevels(w: number, h: number) {
    if (this.levels.length && this.srcW === w && this.srcH === h) return true
    this.releaseLevels()
    const gl = this.gl
    let lw = w
    let lh = h
    for (let i = 0; i <= HALVINGS; i++) {
      const fb = gl.createFramebuffer()
      const rb = gl.createRenderbuffer()
      if (!fb || !rb) return false
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, lw, lh)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb)
      this.levels.push({ fb, rb, w: lw, h: lh })
      lw = Math.max(1, lw >> 1)
      lh = Math.max(1, lh >> 1)
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.srcW = w
    this.srcH = h
    return true
  }

  private releaseLevels() {
    const gl = this.gl
    for (const level of this.levels) {
      gl.deleteFramebuffer(level.fb)
      gl.deleteRenderbuffer(level.rb)
    }
    this.levels = []
  }

  /** Collect any finished readback, then start a new one from the default framebuffer. */
  tick() {
    const gl = this.gl
    this.collect()

    const slot = this.slots[this.next]
    if (!slot || slot.sync) return
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    if (!this.ensureLevels(w, h)) return
    const small = this.levels[this.levels.length - 1]
    if (!small) return

    const scissor = gl.isEnabled(gl.SCISSOR_TEST)
    if (scissor) gl.disable(gl.SCISSOR_TEST)
    // A multisampled default framebuffer can only resolve at 1:1, then halve.
    let src: WebGLFramebuffer | null = null
    let sw = w
    let sh = h
    for (const level of this.levels) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, level.fb)
      gl.blitFramebuffer(0, 0, sw, sh, 0, 0, level.w, level.h, gl.COLOR_BUFFER_BIT, gl.LINEAR)
      src = level.fb
      sw = level.w
      sh = level.h
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, small.fb)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo)
    const bytes = small.w * small.h * 4
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ)
    gl.readPixels(0, 0, small.w, small.h, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (scissor) gl.enable(gl.SCISSOR_TEST)

    slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    slot.w = small.w
    slot.h = small.h
    gl.flush()
    this.next = (this.next + 1) % this.slots.length
  }

  private collect() {
    const gl = this.gl
    for (const slot of this.slots) {
      if (!slot.sync) continue
      if (gl.getSyncParameter(slot.sync, gl.SYNC_STATUS) !== gl.SIGNALED) continue
      gl.deleteSync(slot.sync)
      slot.sync = null
      const size = slot.w * slot.h * 4
      const data = snapshot && snapshot.data.length === size ? snapshot.data : new Uint8Array(size)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo)
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
      snapshot = { data, w: slot.w, h: slot.h, version: ++this.version }
    }
  }

  dispose() {
    const gl = this.gl
    this.releaseLevels()
    for (const slot of this.slots) {
      if (slot.sync) gl.deleteSync(slot.sync)
      gl.deleteBuffer(slot.pbo)
    }
    this.slots = []
    snapshot = null
  }
}

/** Takes over rendering (priority 1) so the capture runs right after the frame is drawn. */
export function DuneCapture() {
  const gl = useThree((state) => state.gl)
  const capture = useRef<Capture | null>(null)

  useEffect(() => {
    const ctx = gl.getContext()
    if (!(ctx instanceof WebGL2RenderingContext)) return
    const next = new Capture(ctx)
    capture.current = next
    return () => {
      next.dispose()
      capture.current = null
    }
  }, [gl])

  useFrame((state) => {
    state.gl.render(state.scene, state.camera)
    capture.current?.tick()
  }, 1)

  return null
}
