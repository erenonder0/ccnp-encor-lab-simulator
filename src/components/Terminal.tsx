import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api';

interface Props {
  sessionId: string;
  device: string;
  initialPrompt: string;
  visible: boolean;
  /** reset sonrasi terminali temizlemek icin artan sayac */
  resetTick: number;
}

/** Tek cihaz icin xterm konsolu. Satir duzenleme + gecmis + '?' yardimi. */
export default function DeviceTerminal({ sessionId, device, initialPrompt, visible, resetTick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const state = useRef({ buffer: '', prompt: initialPrompt, history: [] as string[], histIdx: -1, busy: false });

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
    termRef.current = term;
    fitRef.current = fit;

    const st = state.current;
    term.writeln(`${device} console  (Ctrl+Z: end, ?: yardim)`);
    term.write('\r\n' + st.prompt);

    const redraw = (newBuf: string) => {
      term.write('\b \b'.repeat(st.buffer.length));
      st.buffer = newBuf;
      term.write(st.buffer);
    };

    const send = async (input: string, echoNewline = true) => {
      if (st.busy) return;
      st.busy = true;
      if (echoNewline) term.write('\r\n');
      try {
        const res = await api.exec(sessionId, device, input);
        st.prompt = res.prompt;
        if (res.output) term.write(res.output.replace(/\n/g, '\r\n') + '\r\n');
      } catch (e) {
        term.write(`\r\n[baglanti hatasi: ${String(e)}]\r\n`);
      }
      term.write(st.prompt);
      st.busy = false;
    };

    const onData = term.onData(async (data) => {
      for (const ch of data) {
        if (st.busy) continue;
        if (ch === '\r') {
          const line = st.buffer;
          st.buffer = '';
          if (line.trim()) {
            st.history.push(line);
            st.histIdx = st.history.length;
          }
          await send(line);
        } else if (ch === '\x7f') {
          if (st.buffer.length) {
            st.buffer = st.buffer.slice(0, -1);
            term.write('\b \b');
          }
        } else if (ch === '\x03') {
          term.write('^C\r\n' + st.prompt);
          st.buffer = '';
        } else if (ch === '\x1a') {
          st.buffer = '';
          term.write('^Z');
          await send('\x1a');
        } else if (ch === '\t') {
          if (!st.buffer.trim()) continue;
          st.busy = true;
          try {
            const res = await api.complete(sessionId, device, st.buffer);
            if (res.input !== st.buffer) redraw(res.input);
          } catch {
            /* tamamlama hatasi sessizce yutulur */
          }
          st.busy = false;
        } else if (ch === '?') {
          const line = st.buffer;
          term.write('?\r\n');
          st.busy = true;
          try {
            const res = await api.exec(sessionId, device, line + '?');
            if (res.output) term.write(res.output.replace(/\n/g, '\r\n') + '\r\n');
            term.write(st.prompt + st.buffer);
          } catch {
            term.write(st.prompt + st.buffer);
          }
          st.busy = false;
        } else if (ch >= ' ') {
          st.buffer += ch;
          term.write(ch);
        }
      }
    });

    const onKey = term.onKey(({ domEvent }) => {
      if (st.busy) return;
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
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, device, resetTick]);

  useEffect(() => {
    if (visible) {
      fitRef.current?.fit();
      termRef.current?.focus();
    }
  }, [visible]);

  return <div ref={containerRef} className={visible ? 'h-full w-full' : 'hidden'} />;
}
