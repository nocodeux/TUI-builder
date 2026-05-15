// GameHUD.jsx — renders level.rows (HUD layer) in play mode.
//
// Rendering exactly mirrors the export (exportHTML in App.jsx):
//   • Same wrapperStyle formula and parentDirection threading
//   • Row: single div (no extra wrapper) — no retro-row CSS class
//   • isSingleWindow centering matches editor / export preview-area logic
//   • viewMode='mobile' applies 420px max-width constraint matching the editor

import React from 'react';
import Window from '../components/Componentes/Window';
import Frame from '../components/Componentes/Frame';
import Button from '../components/Componentes/Button';
import Text from '../components/Componentes/Text';
import TextBox from '../components/Componentes/TextBox';
import CheckBox from '../components/Componentes/CheckBox';
import RadioButton from '../components/Componentes/RadioButton';
import ComboBox from '../components/Componentes/ComboBox';
import Selector from '../components/Componentes/Selector';
import ListBox from '../components/Componentes/ListBox';
import Shape from '../components/Componentes/Shape';
import Line from '../components/Componentes/Line';
import ImageComp from '../components/Componentes/Image';
import ScrollBar from '../components/Componentes/ScrollBar';
import Loader from '../components/Componentes/Loader';
import Tabs from '../components/Componentes/Tabs';
import DataRepeater from '../components/Componentes/DataRepeater';
import Form from '../components/Componentes/Form';

const componentMap = {
  Window, Frame, Button, Text, Label: Text, Input: TextBox, TextBox,
  CheckBox, RadioButton, ComboBox, Selector, ListBox, Shape, Line,
  Image: ImageComp, HScrollBar: ScrollBar, VScrollBar: ScrollBar,
  Loader, Tabs, DataRepeater, Form,
  // Row: intentionally excluded — rendered inline to avoid retro-row CSS
};

const CONTAINER_TYPES = ['Window', 'Frame', 'Tabs', 'DataRepeater', 'Form'];

// Mirrors layoutToStyles() from App.jsx
function layoutToStyles(layout = {}) {
  return {
    display:        'flex',
    flexDirection:  layout.direction  || 'row',
    gap:            (layout.gap !== '' && layout.gap != null) ? layout.gap : 8,
    alignItems:     layout.align      || 'flex-start',
    justifyContent: layout.justify    || 'flex-start',
    flexWrap:       layout.wrap ? 'wrap' : 'nowrap',
    paddingTop:     layout.paddingTop    || undefined,
    paddingRight:   layout.paddingRight  || undefined,
    paddingBottom:  layout.paddingBottom || undefined,
    paddingLeft:    layout.paddingLeft   || undefined,
  };
}

// Mirrors renderComponentExport() from App.jsx.
// parentDirection: flex-direction of the enclosing container row.
function renderComp(comp, ctx, parentDirection = 'row') {
  const p = comp.props || {};
  const { onNavigateLevel, onNavigateScreen } = ctx;

  const isWFill = p.sizing?.widthMode  === 'fill';
  const isHFill = p.sizing?.heightMode === 'fill';
  const isWHug  = p.sizing?.widthMode  === 'hug';
  const isHHug  = p.sizing?.heightMode === 'hug';

  // Same wrapperStyle formula as export (App.jsx renderComponentExport)
  const shouldStretch = isHFill || (isWFill && parentDirection === 'column');
  const wrapStyle = {
    display:   (isWFill || isHFill) ? 'flex' : 'inline-flex',
    flex:      isWFill ? '1 1 0' : (isHFill ? '1 1 auto' : '0 0 auto'),
    alignSelf: shouldStretch ? 'stretch' : 'auto',
    minWidth:  0,
    minHeight: isHFill ? 0 : undefined,
    boxSizing: 'border-box',
    maxWidth:  '100%',
  };

  const handleClick = () => {
    if (p.action === 'level'    && p.targetLevelId)  onNavigateLevel?.(p.targetLevelId);
    else if (p.action === 'screen' && p.targetScreenId) onNavigateScreen?.(p.targetScreenId);
    else if (p.action === 'external' && p.href)         window.open(p.href, '_blank');
  };

  // ── Row: single div, no retro-row class, mirrors export case 'Row' ────────
  if (comp.type === 'Row') {
    const rowDir = p.layout?.direction || 'row';
    return (
      <div style={{
        ...wrapStyle,
        ...layoutToStyles(p.layout),
        width:     isWFill ? '100%' : (p.width ? (typeof p.width === 'string' ? p.width : `${p.width}px`) : '100%'),
        minHeight: isHFill ? '100%' : (p.height ? (typeof p.height === 'string' ? p.height : `${p.height}px`) : 32),
        height:    isHFill ? '100%' : 'auto',
      }}>
        {(comp.children || []).map(child => (
          <React.Fragment key={child.id}>
            {renderComp(child, ctx, rowDir)}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const Comp = componentMap[comp.type];
  if (!Comp) return null;

  const isContainer = CONTAINER_TYPES.includes(comp.type);
  const childDir = p.layout?.direction || 'row';
  const children = isContainer
    ? (comp.children || []).map(child => (
        <React.Fragment key={child.id}>
          {renderComp(child, ctx, childDir)}
        </React.Fragment>
      ))
    : null;

  return (
    <div style={wrapStyle}>
      <Comp
        {...p}
        id={comp.id}
        width={isWFill  ? '100%' : isWHug  ? 'auto' : p.width  || 'auto'}
        height={isHFill ? '100%' : isHHug  ? 'auto' : p.height || 'auto'}
        onClick={handleClick}
      >
        {children}
      </Comp>
    </div>
  );
}

export default function GameHUD({ rows, onNavigateLevel, onNavigateScreen, viewMode }) {
  const ctx = { onNavigateLevel, onNavigateScreen };
  const isMobile = viewMode === 'mobile';

  // Mirrors export isSingleWindow logic
  const isSingleWindow =
    rows?.length === 1 &&
    rows[0]?.children?.length === 1 &&
    rows[0].children[0].type === 'Window';

  // Full-size wrapper — fills the viewport frame.
  // Uses flex-column + align-items:center so the content area can be
  // centered when needed (mobile constraint, single-window).
  return (
    <div style={{
      position:      'absolute',
      inset:         0,
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',     // horizontal centering of content area
      overflow:      'auto',
      pointerEvents: 'auto',
    }}>
      {/* Content area: mirrors .preview-area CSS + export previewStyles */}
      <div style={{
        boxSizing:      'border-box',
        padding:        20,
        // Mobile: constrain to 420px, matching .canvas.mobile .preview-area
        width:          '100%',
        maxWidth:       isMobile ? 420 : undefined,
        // Single-window: flex column centered (mirrors .preview-area.centered)
        ...(isSingleWindow ? {
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          flex:           1,          // stretch to full height for vertical centering
          alignSelf:      'stretch',  // fill the flex outer container height
        } : {
          display: 'block',
        }),
      }}>
        {(rows || []).map(row => {
          const rowDir = row.layout?.direction || 'row';
          return (
            <div
              key={row.id}
              style={{
                ...layoutToStyles(row.layout),
                width: '100%',
                margin: isSingleWindow ? 0 : '12px 0',
                // For single-window: force center so the window is
                // horizontally centered regardless of the row's default
                // justify setting (which may be flex-start).
                ...(isSingleWindow ? {
                  justifyContent: 'center',
                  alignItems:     'center',
                } : {}),
              }}
            >
              {(row.children || []).map(comp => (
                <React.Fragment key={comp.id}>
                  {renderComp(comp, ctx, rowDir)}
                </React.Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
