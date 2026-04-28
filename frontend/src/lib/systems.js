import { Database, FileCheck, Building2, CheckCircle, Activity } from 'lucide-react';

// Единый источник правды для названий/описаний систем в UI.
export const SYSTEMS_CONFIG = {
  era: {
    name: 'Инженерный мониторинг',
    icon: Database,
    color: 'blue',
    description: 'Система инженерного мониторинга работ',
    endpoint: 'GET /api/v1/monitoring/telemetry',
    mockData: {
      request: '{ "contract_id": "CNT-2024-001", "period": "2025-01" }',
      response: '{ "items": [...], "total": 15, "source": "monitoring" }'
    }
  },
  smb: {
    name: 'СМБ',
    icon: Activity,
    color: 'cyan',
    description: 'Система мониторинга бурения',
    endpoint: 'GET /api/v1/smb/actual-works',
    mockData: {
      request: '{ "contract_id": "CNT-2024-001", "date_range": "2025-01" }',
      response: '{ "works": [...], "count": 23, "status": "ok" }'
    }
  },
  contracts: {
    name: 'Договоры',
    icon: FileCheck,
    color: 'purple',
    description: 'Реестр договоров и писем',
    endpoint: 'GET /api/v1/contracts/{id}',
    mockData: {
      request: '{ "id": "CNT-2024-001" }',
      response: '{ "number": "ГПН-БС/2024-1847", "rates": [...] }'
    }
  },
  sus: {
    name: 'СУС',
    icon: FileCheck,
    color: 'amber',
    description: 'Система учётных документов',
    endpoint: 'POST /api/v1/sus/documents/generate',
    mockData: {
      request: '{ "type": "act_ks2", "data": {...} }',
      response: '{ "doc_id": "ACT-2025-001", "status": "created" }'
    }
  },
  edo: {
    name: 'СЭД ГШП',
    icon: CheckCircle,
    color: 'emerald',
    description: 'Система электронного документооборота ГШП',
    endpoint: 'POST /api/v1/sed/routes',
    mockData: {
      request: '{ "document_id": "ACT-001", "route_type": "approval" }',
      response: '{ "route_id": "R-001", "steps": [...] }'
    }
  },
  erp: {
    name: 'ERP (SAP)',
    icon: Building2,
    color: 'red',
    description: 'SAP ERP — учёт и финансы',
    endpoint: 'POST /api/v1/erp/accounting',
    mockData: {
      request: '{ "document": {...}, "action": "post" }',
      response: '{ "erp_id": "SAP-2025-0001", "posted": true }'
    }
  }
};

export const PROFILE_SYSTEMS = [
  { key: 'edo', label: SYSTEMS_CONFIG.edo.name },
  { key: 'erp', label: 'ERP / 1C' },
  { key: 'contracts', label: 'Реестр договоров' },
  { key: 'smb', label: SYSTEMS_CONFIG.smb.name },
  { key: 'era', label: SYSTEMS_CONFIG.era.name },
];

