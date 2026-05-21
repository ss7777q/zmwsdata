#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const TEMP_EXPORT_DIR = path.join(ROOT, 'temp', 'role-skill-export');
const HOST = process.env.TEMP_PREVIEW_HOST || '127.0.0.1';
const PORT = Number(process.env.TEMP_PREVIEW_PORT || 2418);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, statusCode, body) {
  setCors(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function notFound(res, message = 'Not found') {
  json(res, 404, { error: message });
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listRoleFolders() {
  if (!fs.existsSync(TEMP_EXPORT_DIR)) {
    return [];
  }
  return fs.readdirSync(TEMP_EXPORT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function getRoleExportPath(roleKey) {
  return path.join(TEMP_EXPORT_DIR, roleKey, 'role-export.json');
}

function loadRoleSummary(roleKey) {
  const filePath = getRoleExportPath(roleKey);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const data = safeReadJson(filePath);
  return {
    roleKey,
    unitSlug: roleKey,
    categoryId: 'role',
    roleName: data?.meta?.roleName || roleKey,
    exportVersion: data?.meta?.exportVersion || 0,
    generatedAt: data?.meta?.generatedAt || null,
    unresolvedCount: Array.isArray(data?.unresolved) ? data.unresolved.length : 0,
    excelDisplayRowsCount: Array.isArray(data?.sections?.excelDisplayRows) ? data.sections.excelDisplayRows.length : 0,
    sectionCounts: Object.fromEntries(
      Object.entries(data?.sections || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]),
    ),
  };
}

function buildCatalog() {
  const roles = listRoleFolders()
    .map(loadRoleSummary)
    .filter(Boolean);

  return {
    categories: [
      {
        id: 'role',
        label: '角色',
        description: '读取 temp/role-skill-export 下的角色导出结果。',
        items: roles,
      },
      {
        id: 'pet',
        label: '宠物',
        description: '临时占位，后续接正式导出结构。',
        items: [
          {
            id: 'pet-placeholder',
            label: '宠物展示筹备中',
            status: 'placeholder',
          },
        ],
      },
      {
        id: 'ride',
        label: '坐骑',
        description: '临时占位，后续接正式导出结构。',
        items: [
          {
            id: 'ride-placeholder',
            label: '坐骑展示筹备中',
            status: 'placeholder',
          },
        ],
      },
    ],
  };
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (url.pathname === '/api/temp-preview/health') {
    json(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      tempExportDir: TEMP_EXPORT_DIR,
      roleCount: listRoleFolders().length,
    });
    return;
  }

  if (url.pathname === '/api/temp-preview/catalog') {
    json(res, 200, buildCatalog());
    return;
  }

  if (url.pathname === '/api/temp-preview/roles') {
    const roles = listRoleFolders()
      .map(loadRoleSummary)
      .filter(Boolean);
    json(res, 200, { items: roles });
    return;
  }

  if (url.pathname.startsWith('/api/temp-preview/roles/')) {
    const roleKey = decodeURIComponent(url.pathname.slice('/api/temp-preview/roles/'.length));
    const filePath = getRoleExportPath(roleKey);
    if (!fs.existsSync(filePath)) {
      notFound(res, `Role export not found: ${roleKey}`);
      return;
    }
    const data = safeReadJson(filePath);
    json(res, 200, data);
    return;
  }

  if (url.pathname.startsWith('/api/temp-preview/units/')) {
    const unitSlug = decodeURIComponent(url.pathname.slice('/api/temp-preview/units/'.length));
    const roleSummary = loadRoleSummary(unitSlug);
    if (!roleSummary) {
      notFound(res, `Unit export not found: ${unitSlug}`);
      return;
    }
    const data = safeReadJson(getRoleExportPath(unitSlug));
    json(res, 200, {
      unitMeta: {
        unitSlug,
        categoryId: 'role',
        roleKey: roleSummary.roleKey,
        roleName: roleSummary.roleName,
        generatedAt: roleSummary.generatedAt,
        unresolvedCount: roleSummary.unresolvedCount,
        excelDisplayRowsCount: roleSummary.excelDisplayRowsCount,
      },
      export: data,
    });
    return;
  }

  notFound(res);
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`Temp preview API listening on http://${HOST}:${PORT}`);
});
