// Display-only camera. No piece coordinates, areas, or geometry are modified.
export const INITIAL_ZOOM = 1.35;
export const MIN_ZOOM = .35;
export const MAX_ZOOM = 5;
export const clampZoom = zoom => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
export const initialCamera = () => ({x: 9, y: 5, zoom: INITIAL_ZOOM});
export function cameraBox(camera) {
  const width = 20 / camera.zoom, height = 12 / camera.zoom;
  return {x: camera.x - width / 2, y: camera.y - height / 2, width, height};
}
export function zoomCamera(camera, factor) {
  return {...camera, zoom: clampZoom(camera.zoom * factor)};
}
export function fitCamera(points, padding = .7) {
  if (!points.length) return initialCamera();
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    zoom: clampZoom(Math.min(20 / (maxX - minX + padding * 2), 12 / (maxY - minY + padding * 2)))
  };
}
export function panCamera(camera, dx, dy) {
  // Limit the camera center, not the piece positions. The entire work area remains reachable.
  return {...camera, x: Math.max(-20, Math.min(40, camera.x - dx)), y: Math.max(-12, Math.min(24, camera.y - dy))};
}
