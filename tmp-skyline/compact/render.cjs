// Render each building group of buildings.svg on its own, labels removed,
// at 1 px per SVG unit, into tmp-skyline/compact/parts/<id>.png.
const fs = require('fs')
const path = require('path')
const { Resvg } = require('./tool/node_modules/@resvg/resvg-js')

const dir = __dirname
const src = fs.readFileSync(path.join(dir, 'buildings.svg'), 'utf8').replace(/<text[\s\S]*?<\/text>/g, '')
const ids = [...src.matchAll(/<g id="([^"]+)" transform=/g)].map((m) => m[1])
fs.mkdirSync(path.join(dir, 'parts'), { recursive: true })

function render(svg, file) {
  const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: 1 }, background: 'rgba(0,0,0,0)' }).render().asPng()
  fs.writeFileSync(file, png)
}

render(src, path.join(dir, 'all.png'))
for (const id of ids) {
  const svg = src.replace(/<g id="([^"]+)" transform=/g, (m, g) => (g === id ? m : `<g id="${g}" display="none" transform=`))
  render(svg, path.join(dir, 'parts', `${id}.png`))
}
console.log(ids.length, 'parts')
