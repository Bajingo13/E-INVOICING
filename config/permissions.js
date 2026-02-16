'use strict';

module.exports = {
  PERMISSIONS: {

    // INVOICE
    INVOICE_CREATE: 'invoice_create',
    INVOICE_EDIT: 'invoice_edit',
    INVOICE_DELETE: 'invoice_delete',
    INVOICE_VOID: 'invoice_void',          
    INVOICE_SUBMIT: 'invoice_submit',
    INVOICE_APPROVE: 'invoice_approve',
    INVOICE_VIEW: 'invoice_view',
    INVOICE_LIST: 'invoice_list',
    INVOICE_EXPORT: 'invoice_export',

    // CONTACTS
    CONTACT_VIEW: 'contact_view',
    CONTACT_ADD: 'contact_add',
    CONTACT_EDIT: 'contact_edit',
    CONTACT_DELETE: 'contact_delete',

    // REPORTS
    REPORT_GENERATE: 'report_generate',
    REPORT_EXPORT: 'report_export',

    // COA
    COA_VIEW: 'coa_view',

    // SYSTEM
    SETTINGS_ACCESS: 'settings_access',
    INVOICE_SETTINGS: 'invoice_settings',
    AUDIT_TRAIL: 'audit_trail',
    LOCK_PERIOD: 'lock_period',

    // USERS
    USER_MANAGE: 'user_manage'
  }
};
