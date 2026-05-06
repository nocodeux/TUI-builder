import React from 'react';
import { useDrop } from 'react-dnd';
import Window from './Componentes/Window';
import Frame from './Componentes/Frame';
import Button from './Componentes/Button';
import Label from './Componentes/Label';
import TextBox from './Componentes/TextBox';
import CheckBox from './Componentes/CheckBox';
import RadioButton from './Componentes/RadioButton';
import ComboBox from './Componentes/ComboBox';
import ListBox from './Componentes/ListBox';
import PictureBox from './Componentes/PictureBox';
import Timer from './Componentes/Timer';
import Shape from './Componentes/Shape';
import Line from './Componentes/Line';
import Image from './Componentes/Image';
import ScrollBar from './Componentes/ScrollBar';
import Data from './Componentes/Data';

const componentMap = {
  Window, Frame, Button, Label, TextBox, CheckBox, RadioButton,
  ComboBox, ListBox, PictureBox, Timer, Shape, Line, Image, HScrollBar: ScrollBar, VScrollBar: ScrollBar, Data
};

const renderComponent = (comp, selectedId, onSelect, onDelete, onDuplicate, onAddComponent, activeWindow) => {
  const Component = componentMap[comp.type];
  if (!Component) return null;

  if (comp.type === 'Window' && activeWindow && comp.id !== activeWindow) {
    return (
      <div key={comp.id} className="component-wrapper window-hidden" title={comp.props.title}
        onClick={(e) => { e.stopPropagation(); onSelect(comp.id); }}>
        <div style={{ opacity: 0.35, pointerEvents: 'none' }}>
          <Component {...comp.props} id={comp.id} />
        </div>
      </div>
    );
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Delete') { e.preventDefault(); onDelete(comp.id); }
    if ((e.key === 'd' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); onDuplicate(comp.id); }
  };

  return (
    <div
      key={comp.id}
      className={`component-wrapper ${selectedId === comp.id ? 'selected' : ''}`}
      onClick={(e) => { e.stopPropagation(); onSelect(comp.id); }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Component
        {...comp.props}
        id={comp.id}
        selected={selectedId === comp.id}
        onAddChild={(type) => onAddComponent(type, comp.id)}
      >
        {comp.children && comp.children.length > 0 && (
          comp.children.map(child => renderComponent(child, selectedId, onSelect, onDelete, onDuplicate, onAddComponent, activeWindow))
        )}
      </Component>
    </div>
  );
};

function Canvas({ components, selectedId, onSelect, onDelete, onDuplicate, viewMode, onAddComponent, activeWindow, setActiveWindow, theme }) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'COMPONENT',
    drop: (item, monitor) => {
      if (monitor.didDrop()) return;
      onAddComponent(item.type, null);
      return { added: true };
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() })
  }));

  return (
    <div className={`canvas ${viewMode}`}>
      <div
        ref={drop}
        className="preview-area"
        onClick={() => onSelect(null)}
      >
        {components.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>
            [ Drag components from toolbox to canvas ]<br/>
            [ Click to select | Delete to remove | Ctrl+D to duplicate ]<br/>
            [ Windows and Frames can contain other components ]
          </div>
        )}
        {components.map(comp => renderComponent(comp, selectedId, onSelect, onDelete, onDuplicate, onAddComponent, activeWindow))}
      </div>
    </div>
  );
}

export default Canvas;
