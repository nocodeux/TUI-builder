import React from 'react';

export const DataContext = React.createContext(null);

function DataRepeater({ 
  children, 
  tableName, 
  database, 
  layout = { direction: 'column', gap: 8, align: 'stretch', justify: 'flex-start' },
  width = '100%',
  height = 'auto',
  onAddChild,
  onMoveChild,
  filterField = '',
  filterValue = ''
}) {
  let records = database?.data?.[tableName] || [];

  if (filterField && filterValue) {
    records = records.filter(r => String(r[filterField]) === String(filterValue));
  }

  const style = {
    display: 'flex',
    flexDirection: layout.direction || 'column',
    gap: layout.gap || 8,
    alignItems: layout.align || 'stretch',
    justifyContent: layout.justify || 'flex-start',
    width: typeof width === 'string' && width.includes('%') ? width : `${width}px`,
    height: typeof height === 'string' && height.includes('%') ? height : `${height}px`,
    minHeight: 40,
    border: '1px dashed var(--accent)',
    borderRadius: 4,
    padding: 8,
    position: 'relative'
  };

  if (!tableName) {
    return (
      <div style={style}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', width: '100%' }}>
          [ Select a table in the Inspector ]
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div style={style}>
        <div style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', width: '100%' }}>
          [ No records found in table: {tableName} ]
        </div>
      </div>
    );
  }

  // In the editor, we only show 1 or 2 items as a preview to avoid cluttering the canvas
  // But we render the children for EACH record in the "Data Context"
  const previewRecords = records.slice(0, 3); // Preview first 3
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div style={style}>
      <div style={{ position: 'absolute', top: -14, left: 4, fontSize: 8, color: 'var(--accent)', background: 'var(--bg)', padding: '0 4px', border: '1px solid var(--accent)', borderRadius: 2 }}>
        REPEATER: {tableName} ({records.length} items)
      </div>
      
      {!hasChildren && (
        <div style={{ 
          border: '1px dashed var(--accent)', 
          padding: 20, 
          textAlign: 'center', 
          fontSize: 10, 
          color: 'var(--accent)',
          background: 'rgba(0,255,0,0.05)',
          width: '100%'
        }}>
          DRAG COMPONENTS HERE TO CREATE THE TEMPLATE
        </div>
      )}

      {hasChildren && previewRecords.map((record, index) => (
        <DataContext.Provider key={index} value={record}>
          <div className="repeater-item-preview" style={{ 
            border: '1px dotted var(--border)', 
            padding: 8, 
            borderRadius: 2,
            position: 'relative',
            background: 'rgba(0,255,0,0.02)',
            minHeight: 30,
            width: '100%'
          }}>
            <div style={{ position: 'absolute', right: 2, top: 2, fontSize: 7, color: 'var(--text-dim)', opacity: 0.5 }}>#{index + 1}</div>
            {children}
          </div>
        </DataContext.Provider>
      ))}

      {records.length > 3 && hasChildren && (
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', marginTop: 4 }}>
          + {records.length - 3} more items hidden in editor
        </div>
      )}
    </div>
  );
}

export default DataRepeater;
