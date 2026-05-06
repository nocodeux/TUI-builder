import React, { useState } from 'react';

function DatabasePanel({ database, setDatabase, onClose, triggerSave }) {
  const [activeTab, setActiveTab] = useState('tables');
  const [newTableName, setNewTableName] = useState('');
  const [newField, setNewField] = useState({ name: '', type: 'TEXT' });
  const [editingTable, setEditingTable] = useState(null);
  const [newRowData, setNewRowData] = useState({});
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState('');

  const tables = database.tables || [];
  const tableData = database.data || {};

  const addTable = () => {
    if (!newTableName.trim()) return;
    const table = {
      name: newTableName.trim(),
      fields: [{ name: 'id', type: 'INTEGER', primary: true }],
      created: new Date().toISOString()
    };
    const newDb = {
      ...database,
      tables: [...tables, table],
      data: { ...tableData, [table.name]: [] }
    };
    setDatabase(newDb);
    if (triggerSave) triggerSave(newDb);
    setNewTableName('');
  };

  const addField = () => {
    if (!newField.name.trim() || !editingTable) return;
    const newDb = {
      ...database,
      tables: database.tables.map(t =>
        t.name === editingTable
          ? { ...t, fields: [...t.fields, { name: newField.name.trim(), type: newField.type }] }
          : t
      )
    };
    setDatabase(newDb);
    if (triggerSave) triggerSave(newDb);
    setNewField({ name: '', type: 'TEXT' });
  };

  const addRow = () => {
    if (!editingTable) return;
    const table = tables.find(t => t.name === editingTable);
    if (!table) return;
    const row = { id: Date.now() };
    table.fields.filter(f => !f.primary).forEach(f => {
      row[f.name] = newRowData[f.name] || '';
    });
    const newDb = {
      ...database,
      data: {
        ...database.data,
        [editingTable]: [...(database.data[editingTable] || []), row]
      }
    };
    setDatabase(newDb);
    if (triggerSave) triggerSave(newDb);
    setNewRowData({});
  };

  const deleteRow = (rowId) => {
    if (!editingTable) return;
    const newDb = {
      ...database,
      data: {
        ...database.data,
        [editingTable]: (database.data[editingTable] || []).filter(r => r.id !== rowId)
      }
    };
    setDatabase(newDb);
    if (triggerSave) triggerSave(newDb);
  };

  const deleteTable = (tableName) => {
    const newDb = {
      ...database,
      tables: database.tables.filter(t => t.name !== tableName),
      data: Object.fromEntries(Object.entries(database.data).filter(([k]) => k !== tableName))
    };
    setDatabase(newDb);
    if (triggerSave) triggerSave(newDb);
    if (editingTable === tableName) setEditingTable(null);
  };

  const executeQuery = () => {
    setQueryError('');
    setQueryResult(null);
    const q = sqlQuery.trim().toLowerCase();
    if (q.startsWith('select')) {
      const parts = q.split(/\s+/);
      const fromIdx = parts.indexOf('from');
      if (fromIdx === -1) { setQueryError('Invalid syntax'); return; }
      const tableName = parts[fromIdx + 1];
      const data = tableData[tableName];
      if (!data) { setQueryError(`Table '${tableName}' not found`); return; }
      setQueryResult({ type: 'select', table: tableName, rows: data, count: data.length });
    } else if (q.startsWith('show tables') || q.startsWith('show_tables')) {
      setQueryResult({ type: 'show_tables', tables: tables.map(t => t.name) });
    } else {
      setQueryError('Only SELECT and SHOW TABLES queries supported');
    }
  };

  const exportTableData = (tableName) => {
    const data = tableData[tableName] || [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tableName}.json`;
    link.click();
  };

  const currentTable = tables.find(t => t.name === editingTable);
  const currentTableData = tableData[editingTable] || [];

  return (
    <div className="db-overlay" onClick={onClose}>
      <div className="db-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-titlebar">
          <span className="modal-title">[ Database Manager ]</span>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="db-tabs">
          <button className={`db-tab ${activeTab === 'tables' ? 'active' : ''}`} onClick={() => setActiveTab('tables')}>Tables</button>
          <button className={`db-tab ${activeTab === 'data' ? 'active' : ''}`} onClick={() => setActiveTab('data')} disabled={!editingTable}>Data</button>
          <button className={`db-tab ${activeTab === 'query' ? 'active' : ''}`} onClick={() => setActiveTab('query')}>Query</button>
        </div>

        {activeTab === 'tables' && (
          <div className="db-content">
            <div className="db-section">
              <h3 style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>CREATE TABLE</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Table name"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="db-input"
                  onKeyDown={(e) => e.key === 'Enter' && addTable()}
                />
                <button className="db-btn" onClick={addTable}>Create</button>
              </div>
            </div>

            <div className="modal-divider" />

            <h3 style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>TABLES</h3>
            {tables.length === 0 && (
              <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>No tables created</div>
            )}
            {tables.map(table => (
              <div key={table.name} className={`db-table-item ${editingTable === table.name ? 'selected' : ''}`}>
                <div onClick={() => setEditingTable(table.name)} style={{ cursor: 'pointer', flex: 1 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 'bold' }}>{table.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                    {table.fields.map(f => f.name).join(', ')} | {(tableData[table.name] || []).length} rows
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="small-btn" onClick={() => exportTableData(table.name)}>Export</button>
                  <button className="small-btn danger" onClick={() => deleteTable(table.name)}>X</button>
                </div>
              </div>
            ))}

            {currentTable && (
              <>
                <div className="modal-divider" />
                <h3 style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>FIELDS: {currentTable.name}</h3>
                <div style={{ marginBottom: 8 }}>
                  {currentTable.fields.map(f => (
                    <div key={f.name} style={{ padding: '2px 0', fontSize: 11 }}>
                      {f.primary && <span style={{ color: 'var(--accent)' }}>[PK] </span>}
                      <span style={{ color: 'var(--text)' }}>{f.name}</span>
                      <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>({f.type})</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Field name"
                    value={newField.name}
                    onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                    className="db-input"
                    style={{ flex: 1 }}
                  />
                  <select
                    value={newField.type}
                    onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                    className="db-input"
                  >
                    <option value="TEXT">TEXT</option>
                    <option value="INTEGER">INTEGER</option>
                    <option value="REAL">REAL</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                  </select>
                  <button className="db-btn" onClick={addField}>+</button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'data' && currentTable && (
          <div className="db-content">
            <h3 style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>ADD RECORD: {currentTable.name}</h3>
            <div style={{ marginBottom: 8 }}>
              {currentTable.fields.filter(f => !f.primary).map(field => (
                <div key={field.name} style={{ marginBottom: 4 }}>
                  <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block' }}>{field.name} ({field.type})</label>
                  <input
                    type={field.type === 'INTEGER' ? 'number' : field.type === 'BOOLEAN' ? 'checkbox' : 'text'}
                    className="db-input"
                    value={newRowData[field.name] || ''}
                    onChange={(e) => setNewRowData({ ...newRowData, [field.name]: e.target.value })}
                  />
                </div>
              ))}
              <button className="db-btn" onClick={addRow}>+ Add Record</button>
            </div>

            <div className="modal-divider" />
            <h3 style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>RECORDS ({currentTableData.length})</h3>
            {currentTableData.length === 0 && (
              <div style={{ color: 'var(--text-dim)', padding: 12, textAlign: 'center' }}>No records</div>
            )}
            {currentTableData.length > 0 && (
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                <table className="db-table">
                  <thead>
                    <tr>
                      {currentTable.fields.map(f => (
                        <th key={f.name} style={{ fontSize: 10 }}>{f.name}</th>
                      ))}
                      <th style={{ fontSize: 10 }}>Act</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentTableData.map(row => (
                      <tr key={row.id}>
                        {currentTable.fields.map(f => (
                          <td key={f.name} style={{ fontSize: 10 }}>{String(row[f.name] ?? '')}</td>
                        ))}
                        <td>
                          <button className="small-btn danger" onClick={() => deleteRow(row.id)}>X</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'query' && (
          <div className="db-content">
            <h3 style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>EXECUTE QUERY</h3>
            <div style={{ marginBottom: 8 }}>
              <textarea
                className="db-input db-query"
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                placeholder="SELECT * FROM tablename"
                rows="3"
              />
              <button className="db-btn" onClick={executeQuery} style={{ marginTop: 4 }}>Execute</button>
            </div>

            {queryError && (
              <div style={{ color: '#ff4444', fontSize: 11, padding: 8, border: '1px solid #ff4444', marginBottom: 8 }}>
                [ERROR] {queryError}
              </div>
            )}

            {queryResult && (
              <div>
                {queryResult.type === 'select' && (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
                      [{queryResult.count} rows in {queryResult.table}]
                    </div>
                    {queryResult.rows.length > 0 && (
                      <div style={{ maxHeight: 300, overflow: 'auto' }}>
                        <table className="db-table">
                          <thead>
                            <tr>
                              {Object.keys(queryResult.rows[0]).map(key => (
                                <th key={key} style={{ fontSize: 10 }}>{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {queryResult.rows.map((row, idx) => (
                              <tr key={idx}>
                                {Object.values(row).map((val, i) => (
                                  <td key={i} style={{ fontSize: 10 }}>{String(val)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
                {queryResult.type === 'show_tables' && (
                  <div>
                    {queryResult.tables.map(t => (
                      <div key={t} style={{ padding: 4, fontSize: 11, color: 'var(--text)' }}>{t}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="modal-divider" />
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              Supported: SELECT * FROM table | SHOW TABLES
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button className="db-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default DatabasePanel;
