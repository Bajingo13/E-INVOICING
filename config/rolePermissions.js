'use strict';

const { PERMISSIONS } = require('./permissions');
const { ROLES } = require('./roles');

module.exports.ROLE_PERMISSIONS = {

  // --------------------------------
  // SUPER ADMIN (Full Access)
  // --------------------------------
  [ROLES.SUPER]: Object.values(PERMISSIONS),

  // --------------------------------
  // APPROVER
  // --------------------------------
  [ROLES.APPROVER]: [

    // INVOICE
    PERMISSIONS.INVOICE_CREATE,
    PERMISSIONS.INVOICE_EDIT,
    PERMISSIONS.INVOICE_DELETE,
    PERMISSIONS.INVOICE_CANCEL,
    PERMISSIONS.INVOICE_APPROVE,
    PERMISSIONS.INVOICE_VIEW,
    PERMISSIONS.INVOICE_LIST,

    // CONTACTS
    PERMISSIONS.CONTACT_VIEW,
    PERMISSIONS.CONTACT_ADD,
    PERMISSIONS.CONTACT_EDIT,
    PERMISSIONS.CONTACT_DELETE,

    // REPORTS
    PERMISSIONS.REPORT_GENERATE,
    PERMISSIONS.REPORT_EXPORT,

    // COA
    PERMISSIONS.COA_VIEW,

    // SYSTEM (Limited)
    PERMISSIONS.SETTINGS_ACCESS, // company info + locking only
    PERMISSIONS.LOCK_PERIOD,

    // AUDIT
    PERMISSIONS.AUDIT_TRAIL
  ],

  // --------------------------------
  // SUBMITTER
  // --------------------------------
  [ROLES.SUBMITTER]: [

    // INVOICE
    PERMISSIONS.INVOICE_CREATE,
    PERMISSIONS.INVOICE_EDIT,
    PERMISSIONS.INVOICE_SUBMIT,
    PERMISSIONS.INVOICE_VIEW,
    PERMISSIONS.INVOICE_LIST,

    // CONTACTS
    PERMISSIONS.CONTACT_VIEW,
    PERMISSIONS.CONTACT_ADD,
    PERMISSIONS.CONTACT_EDIT,

    // COA
    PERMISSIONS.COA_VIEW
  ]

};
