import type { DeviceState, ExecResult } from './types';

/** Basit PC emulasyonu: ping / ipconfig / help */
export function execPc(dev: DeviceState, rawInput: string): ExecResult {
  const promptStr = `${dev.name}> `;
  const raw = rawInput.replace(/[\r\x1a]/g, '').trim();
  if (!raw) return { output: '', prompt: promptStr };

  const tokens = raw.split(/\s+/);
  const cmd = tokens[0].toLowerCase();
  const pc = dev.pc ?? { ip: '0.0.0.0', mask: '255.255.255.0', gateway: '' };

  if ('ping'.startsWith(cmd) && tokens[1]) {
    const target = tokens[1];
    return {
      output: [
        `Pinging ${target} with 32 bytes of data:`,
        `Reply from ${target}: bytes=32 time=1ms TTL=254`,
        `Reply from ${target}: bytes=32 time=1ms TTL=254`,
        `Reply from ${target}: bytes=32 time=1ms TTL=254`,
        `Reply from ${target}: bytes=32 time=1ms TTL=254`,
        '',
        `Ping statistics for ${target}:`,
        '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)',
      ].join('\n'),
      prompt: promptStr,
    };
  }
  if (cmd === 'ipconfig' || cmd === 'ifconfig' || (cmd === 'show' && tokens[1]?.toLowerCase().startsWith('ip'))) {
    return {
      output: [
        'Ethernet adapter Local Area Connection:',
        '',
        `   IPv4 Address. . . . . . . . . . . : ${pc.ip}`,
        `   Subnet Mask . . . . . . . . . . . : ${pc.mask}`,
        `   Default Gateway . . . . . . . . . : ${pc.gateway}`,
      ].join('\n'),
      prompt: promptStr,
    };
  }
  if (cmd === '?' || cmd === 'help') {
    return { output: 'Kullanilabilir komutlar: ping <ip>, ipconfig', prompt: promptStr };
  }
  return { output: `'${tokens[0]}' is not recognized as an internal or external command.`, prompt: promptStr };
}
