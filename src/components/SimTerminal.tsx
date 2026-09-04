import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface Props {
  device: string;
  visible: boolean;
  resetTick: number;
}

/**
 * Bagimsiz, backend'siz konsol. Otomatik puanlama/gercek IOS motoru yok —
 * sadece serbestce komut yazip pratik yapmak icin yerel echo terminali.
 */
export default function SimTerminal({ device, visible, resetTick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const state = useRef({ buffer: '', prompt: `${device}>`, history: [] as string[], histIdx: -1, enabled: false });

  useEffect(() => {
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      theme: { background: '#0a0a0a', foreground: '#d4d4d4', cursor: '#22c55e' },
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current!);
    fit.fit();
    fitRef.current = fit;

    const st = state.current;
    st.buffer = '';
    st.prompt = `${device}>`;
    st.history = [];
    st.histIdx = -1;
    st.enabled = false;

    term.writeln(`${device} console (pratik terminali — otomatik puanlama yok)`);
    term.write('\r\n' + st.prompt);

    const redraw = (newBuf: string) => {
      term.write('\b \b'.repeat(st.buffer.length));
      st.buffer = newBuf;
      term.write(st.buffer);
    };

    const handleLine = (line: string) => {
      const cmd = line.trim().toLowerCase();
      if (cmd === 'enable' || cmd === 'en') {
        st.enabled = true;
        st.prompt = `${device}#`;
      } else if (cmd === 'disable') {
        st.enabled = false;
        st.prompt = `${device}>`;
      } else if (cmd === 'exit' || cmd === 'end') {
        if (st.prompt.includes(')')) {
          st.prompt = st.enabled ? `${device}#` : `${device}>`;
        }
      } else if (cmd === 'configure terminal' || cmd === 'conf t') {
        st.prompt = `${device}(config)#`;
      } else if (cmd.startsWith('interface ') || cmd.startsWith('int ')) {
        st.prompt = `${device}(config-if)#`;
      } else if (cmd === 'clear' || cmd === 'cls') {
        term.clear();
      }
    };

    const onData = term.onData((data) => {
      for (const ch of data) {
        if (ch === '\r') {
          const line = st.buffer;
          st.buffer = '';
          if (line.trim()) {
            st.history.push(line);
            st.histIdx = st.history.length;
          }
          term.write('\r\n');
          if (line.trim().toLowerCase() !== 'clear' && line.trim().toLowerCase() !== 'cls') {
            handleLine(line);
            term.write(st.prompt);
          } else {
            handleLine(line);
            term.write(st.prompt);
          }
        } else if (ch === '\x7f') {
          if (st.buffer.length) {
            st.buffer = st.buffer.slice(0, -1);
            term.write('\b \b');
          }
        } else if (ch === '\x03') {
          term.write('^C\r\n' + st.prompt);
          st.buffer = '';
        } else if (ch >= ' ') {
          st.buffer += ch;
          term.write(ch);
        }
      }
    });

    const onKey = term.onKey(({ domEvent }) => {
      if (domEvent.key === 'ArrowUp') {
        if (st.histIdx > 0) {
          st.histIdx--;
          redraw(st.history[st.histIdx] ?? '');
        }
      } else if (domEvent.key === 'ArrowDown') {
        if (st.histIdx < st.history.length) {
          st.histIdx++;
          redraw(st.history[st.histIdx] ?? '');
        }
      }
    });

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);

    return () => {
      onData.dispose();
      onKey.dispose();
      window.removeEventListener('resize', onResize);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, resetTick]);

  useEffect(() => {
    if (visible) fitRef.current?.fit();
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 h-full w-full ${visible ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
      aria-hidden={!visible}
    />
  );
}
