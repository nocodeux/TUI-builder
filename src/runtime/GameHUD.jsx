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
  const { onNavigateLevel, onNavigateScreen, overlay } = ctx;
  // In block mode (hud-only), fill height has no definite parent — treat as auto.
  const isOverlay = overlay !== false;

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
    // In block mode, fill height has no overlay container to reference — use auto.
    const heightVal = (isHFill && isOverlay) ? '100%' : 'auto';
    const minHeightVal = (isHFill && isOverlay)
      ? '100%'
      : (p.height ? (typeof p.height === 'string' ? p.height : `${p.height}px`) : 32);
    return (
      <div style={{
        ...wrapStyle,
        ...layoutToStyles(p.layout),
        width:     isWFill ? '100%' : (p.width ? (typeof p.width === 'string' ? p.width : `${p.width}px`) : '100%'),
        minHeight: minHeightVal,
        height:    heightVal,
        ...(p.bgColor ? { background: p.bgColor } : {}),
        ...(p.bgImage ? {
          backgroundImage: `url(${p.bgImage})`,
          backgroundSize: p.bgImageFit === 'tile' ? 'auto' : (p.bgImageFit === 'fill' ? '100% 100%' : (p.bgImageFit || 'cover')),
          backgroundRepeat: p.bgImageFit === 'tile' ? 'repeat' : 'no-repeat',
          backgroundPosition: 'center',
        } : {}),
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

// overlay=true  (default): HUD is position:absolute inset:0 over the game canvas (game+hud levels).
// overlay=false           : HUD is a block element that drives its parent's height (hud-only levels).
export default function GameHUD({ rows, onNavigateLevel, onNavigateScreen, viewMode, overlay = true }) {
  const ctx = { onNavigateLevel, onNavigateScreen, overlay };
  const isMobile = viewMode === 'mobile';

  const isSingleWindow =
    rows?.length === 1 &&
    rows[0]?.children?.length === 1 &&
    rows[0].children[0].type === 'Window';

  const rowList = (rows || []).map(row => {
    const rowDir = row.layout?.direction || 'row';
    return (
      <div
        key={row.id}
        style={{
          ...layoutToStyles(row.layout),
          width: '100%',
          ...(isSingleWindow && overlay ? { justifyContent: 'center', alignItems: 'center' } : {}),
        }}
      >
        {(row.children || []).map(comp => (
          <React.Fragment key={comp.id}>
            {renderComp(comp, ctx, rowDir)}
          </React.Fragment>
        ))}
      </div>
    );
  });

  if (!overlay) {
    // Block mode for hud-only: flows in normal document flow, height driven by content.
    return (
      <div style={{
        position:      'relative',
        width:         '100%',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        pointerEvents: 'auto',
        maxWidth:      isMobile ? 420 : undefined,
      }}>
        <div style={{
          width:          '100%',
          display:        'flex',
          flexDirection:  'column',
          ...(isSingleWindow ? { alignItems: 'center', justifyContent: 'center' } : {}),
        }}>
          {rowList}
        </div>
      </div>
    );
  }

  // Overlay mode: fills the game viewport frame (position:absolute, inset:0).
  return (
    <div style={{
      position:      'absolute',
      inset:         0,
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      overflow:      'auto',
      pointerEvents: 'auto',
    }}>
      <div style={{
        boxSizing:      'border-box',
        padding:        0,
        width:          '100%',
        maxWidth:       isMobile ? 420 : undefined,
        ...(isSingleWindow ? {
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          flex:           1,
          alignSelf:      'stretch',
        } : {
          display:        'flex',
          flexDirection:  'column',
          flex:           1,
          alignSelf:      'stretch',
        }),
      }}>
        {rowList}
      </div>
    </div>
  );
}
