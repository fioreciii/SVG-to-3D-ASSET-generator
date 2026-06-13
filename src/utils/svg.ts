import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import * as THREE from 'three';

export function parseSVG(svgString: string) {
  const cleanSvgString = svgString.replace(/currentColor/g, '#ffffff');
  const loader = new SVGLoader();
  const svgData = loader.parse(cleanSvgString);

  const shapes: THREE.Shape[] = [];

  for (const path of svgData.paths) {
    // some SVG path objects don't output proper shapes if we don't pass true
    const pathShapes = path.toShapes(true);
    for (const shape of pathShapes) {
      shapes.push(shape);
    }
  }

  return shapes;
}
