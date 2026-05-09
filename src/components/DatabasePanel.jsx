import React, { useState } from 'react';

function DatabasePanel({ database, setDatabase, onClose }) {
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
    setNewField({ name: '', type: 'TEXT' });
  };

  const addRow = () => {
    if (!editingTable) return;
    const table = tables.find(t => t.name === editingTable);
    if (!table) return;

    // VALIDATION
    const row = { id: Date.now() };
    for (const f of table.fields) {
      if (f.primary) continue;
      let val = newRowData[f.name];
      
      // Basic validation by type
      if (['INTEGER', 'REAL', 'DECIMAL'].includes(f.type)) {
        const num = parseFloat(val);
        if (val !== undefined && val !== '' && isNaN(num)) {
          alert(`Invalid value for ${f.name}. Expected a number.`);
          return;
        }
        val = isNaN(num) ? 0 : num;
      }
      if (f.type === 'BOOLEAN') {
        val = val === true || val === 'true';
      }
      
      row[f.name] = val || (['INTEGER', 'REAL', 'DECIMAL'].includes(f.type) ? 0 : '');
    }

    const newDb = {
      ...database,
      data: {
        ...database.data,
        [editingTable]: [...(database.data[editingTable] || []), row]
      }
    };
    setDatabase(newDb);
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
  };

  const deleteTable = (tableName) => {
    if (!confirm(`Delete table "${tableName}"? This will delete all its data.`)) return;
    const newDb = {
      ...database,
      tables: database.tables.filter(t => t.name !== tableName),
      data: Object.fromEntries(Object.entries(database.data).filter(([k]) => k !== tableName))
    };
    setDatabase(newDb);
    if (editingTable === tableName) setEditingTable(null);
  };

  const renameTable = (oldName, newName) => {
    if (!newName.trim() || oldName === newName) return;
    const cleanNewName = newName.trim();
    if (tables.some(t => t.name === cleanNewName)) return alert('Table name already exists');

    const newDb = {
      ...database,
      tables: database.tables.map(t => t.name === oldName ? { ...t, name: cleanNewName } : t),
      data: Object.fromEntries(Object.entries(database.data).map(([k, v]) => [k === oldName ? cleanNewName : k, v]))
    };
    setDatabase(newDb);
    setEditingTable(cleanNewName);
  };

  const deleteField = (fieldName) => {
    if (fieldName === 'id') return;
    if (!confirm(`Delete field "${fieldName}"? Data for this field will be lost.`)) return;
    const newDb = {
      ...database,
      tables: database.tables.map(t =>
        t.name === editingTable
          ? { ...t, fields: t.fields.filter(f => f.name !== fieldName) }
          : t
      ),
      // Optional: clean up data too
      data: {
        ...database.data,
        [editingTable]: (database.data[editingTable] || []).map(row => {
          const { [fieldName]: _, ...rest } = row;
          return rest;
        })
      }
    };
    setDatabase(newDb);
  };

  const updateRow = (rowId, fieldName, value) => {
    if (!editingTable) return;
    const newDb = {
      ...database,
      data: {
        ...database.data,
        [editingTable]: (database.data[editingTable] || []).map(r => 
          r.id === rowId ? { ...r, [fieldName]: value } : r
        )
      }
    };
    setDatabase(newDb);
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {editingTable === table.name ? (
                    <input 
                      type="text" 
                      defaultValue={table.name} 
                      className="db-input" 
                      style={{ height: 20, fontSize: 11, marginBottom: 2 }}
                      onBlur={(e) => renameTable(table.name, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && renameTable(table.name, e.target.value)}
                    />
                  ) : (
                    <div onClick={() => setEditingTable(table.name)} style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 'bold' }}>{table.name}</div>
                  )}
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>
                    {table.fields.map(f => f.name).join(', ')} | {(tableData[table.name] || []).length} rows
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="small-btn" onClick={() => { setEditingTable(table.name); setActiveTab('data'); }}>Data</button>
                  <button className="small-btn" onClick={() => exportTableData(table.name)}>Exp</button>
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
                    <div key={f.name} style={{ padding: '2px 0', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        {f.primary && <span style={{ color: 'var(--accent)' }}>[PK] </span>}
                        <span style={{ color: 'var(--text)' }}>{f.name}</span>
                        <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>({f.type})</span>
                      </div>
                      {!f.primary && (
                        <button 
                          className="small-btn danger" 
                          style={{ padding: '0 4px', fontSize: 9 }}
                          onClick={() => deleteField(f.name)}
                        >del</button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end', background: 'rgba(255,255,0,0.05)', padding: 8, borderRadius: 4, border: '1px solid rgba(255,255,0,0.2)' }}>
                  <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 9, color: 'var(--accent)' }}>FIELD NAME</label>
                    <input
                      type="text"
                      placeholder={
                        newField.type === 'VARCHAR' || newField.type === 'TEXT' || newField.type === 'CHAR' ? 'e.g. Product_Description' :
                        newField.type === 'INTEGER' ? 'e.g. Quantity' :
                        newField.type === 'DECIMAL' || newField.type === 'REAL' ? 'e.g. Unit_Price' :
                        newField.type === 'DATE' ? 'e.g. Created_At' :
                        newField.type === 'TIME' ? 'e.g. Opening_Hour' :
                        newField.type === 'DATETIME' ? 'e.g. Last_Login' :
                        newField.type === 'BOOLEAN' ? 'e.g. Is_Published' :
                        newField.type === 'BLOB' ? 'e.g. User_Avatar' : 'Field name'
                      }
                      value={newField.name}
                      onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                      className="db-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 9, color: 'var(--accent)' }}>TYPE</label>
                    <select
                      value={newField.type}
                      onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                      className="db-input"
                      style={{ width: '100%' }}
                    >
                      <optgroup label="String Types">
                        <option value="TEXT">TEXT</option>
                        <option value="VARCHAR">VARCHAR</option>
                        <option value="CHAR">CHAR</option>
                      </optgroup>
                      <optgroup label="Numeric Types">
                        <option value="INTEGER">INTEGER</option>
                        <option value="DECIMAL">DECIMAL (Money)</option>
                        <option value="REAL">REAL (Float)</option>
                      </optgroup>
                      <optgroup label="Logic">
                        <option value="BOOLEAN">BOOLEAN</option>
                      </optgroup>
                      <optgroup label="Date & Time">
                        <option value="DATE">DATE</option>
                        <option value="TIME">TIME</option>
                        <option value="DATETIME">DATETIME</option>
                      </optgroup>
                      <optgroup label="Binary">
                        <option value="BLOB">BLOB (File/Image)</option>
                      </optgroup>
                    </select>
                  </div>
                  <button className="db-btn" onClick={addField} style={{ height: 28 }}>ADD FIELD</button>
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
                    type={
                      ['INTEGER', 'REAL', 'DECIMAL'].includes(field.type) ? 'number' : 
                      ['DATE'].includes(field.type) ? 'date' :
                      ['TIME'].includes(field.type) ? 'time' :
                      ['DATETIME'].includes(field.type) ? 'datetime-local' :
                      field.type === 'BOOLEAN' ? 'checkbox' : 'text'
                    }
                    className="db-input"
                    value={newRowData[field.name] || ''}
                    onChange={(e) => setNewRowData({ ...newRowData, [field.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })}
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
                          <td key={f.name} style={{ fontSize: 10, padding: 0 }}>
                            {f.primary ? (
                              <span style={{ padding: '2px 4px' }}>{row[f.name]}</span>
                            ) : (
                              <input 
                                type="text"
                                className="db-table-cell-input"
                                value={String(row[f.name] ?? '')}
                                onChange={(e) => updateRow(row.id, f.name, e.target.value)}
                                style={{ 
                                  width: '100%', 
                                  background: 'transparent', 
                                  border: 'none', 
                                  color: 'var(--text)', 
                                  fontSize: 10,
                                  padding: '4px'
                                }}
                              />
                            )}
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }}>
                          <button className="small-btn danger" style={{ padding: '0 4px' }} onClick={() => deleteRow(row.id)}>X</button>
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

      </div>
    </div>
  );
}

export default DatabasePanel;
