let ioInstance = null;
export function setRealtime(io) {
  ioInstance = io;
}
export function emitToUser(userId, event, payload) {
  if (ioInstance && userId) ioInstance.to(`user:${userId}`).emit(event, payload);
}
export function emitToRole(role, event, payload) {
  if (ioInstance && role) ioInstance.to(`role:${role}`).emit(event, payload);
}
export function emitGlobal(event, payload) {
  if (ioInstance) ioInstance.emit(event, payload);
}
