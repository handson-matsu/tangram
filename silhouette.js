import {polygon} from './geometry.js';
// A compound CCW nonzero path fills the polygon union, without internal strokes.
export function regionPath(pieces) {
  return pieces.map(piece=>'M'+polygon(piece).map(v=>`${v.x},${v.y}`).join('L')+'Z').join('');
}
