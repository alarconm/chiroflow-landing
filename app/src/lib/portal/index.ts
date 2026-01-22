/**
 * Epic 14: Patient Portal - Service Exports
 */

// Types
export * from './types';

// Authentication
export {
  registerPortalUser,
  verifyEmail,
  loginPortalUser,
  validateSession,
  logoutPortalUser,
  requestPasswordReset,
  resetPassword,
  changePassword,
  logPortalAccess,
} from './auth';

// Session Management
export {
  getUserSessions,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  extendSession,
  checkSessionIdle,
  cleanupExpiredSessions,
  getSessionByToken,
  recordSessionActivity,
} from './session';

// Secure Messaging
export {
  getPatientMessages,
  getMessageThread,
  sendPatientMessage,
  archiveMessage,
  deleteMessage,
  getUnreadMessageCount,
  markAllAsRead,
} from './messaging';

// Documents
export {
  getPatientDocuments,
  getDocument,
  recordDocumentDownload,
  getNewDocumentCount,
  getDocumentsSummary,
  uploadPortalDocument,
  reviewDocument,
} from './documents';
