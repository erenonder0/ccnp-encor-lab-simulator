# 🖧 CCNP ENCOR Lab Simülatörü

> Tarayıcıda çalışan, **gerçek Cisco IOS komut satırı** deneyimi sunan bir CCNP ENCOR lab pratik ortamı.
> Sınav ekranını okursun, terminale komutları yazarsın, **"Kontrol Et"** dersin — ve cihazın
> **son yapılandırma durumu** üzerinden puan alırsın.

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-64%2F64%20passing-brightgreen">
  <img alt="Items" src="https://img.shields.io/badge/lab%20items-40%2F40-blue">
</p>

---

## ✨ Neden farklı?

Çoğu sınav simülatörü **tuş vuruşunu** ezberden kontrol eder — tek bir doğru komut dizisi
beklerler. Bu proje bir adım öteye gidiyor: arka planda **gerçek bir IOS CLI emülatörü**
çalışıyor. Sen ne yazarsan yaz, cihazın oluşan **running-config**'i notlandırılıyor.

| ✅ Ödüllendirilir | ❌ Cezalandırılmaz |
|---|---|
| Doğru son yapılandırma | Komutların yazılış sırası |
| `int gi0/1` gibi **kısaltmalar** | Fazladan yazılmış doğru satırlar |
| Farklı ama denk çözümler | Interface adı biçimi (`Gi0/1` = `GigabitEthernet0/1`) |

Kısacası: **düzgün konfigüre et, geç.** Tıpkı gerçek cihazda olduğu gibi.

---

## 🎬 Nasıl çalışır?

1. **Soruyu oku** — Guidelines + Tasks + topoloji görseli + cihaz/IP tablosu.
2. **Cihaza bağlan** — `xterm.js` terminalinde gerçek IOS gibi: `Tab` ile tamamlama, `?` ile yardım, gerçekçi hata mesajları.
3. **Yapılandır** — kısaltmalar, mod geçişleri (`conf t`, `int`, `router ospf`...), `do show run` her şey çalışır.
4. **"Kontrol Et"** — grader running-config ağacını gerekli satırlarla karşılaştırır ve puanını + eksiklerini gösterir.
5. **Cevabı gör** — puanlamadan sonra referans çözüm (`answer_key`) ve açıklama açılır.

> 🔒 Cevap anahtarı ve puanlama kuralları soru yüklenirken **istemciye hiç gönderilmez** —
> ancak `Kontrol Et` sonrası ayrı bir uç noktadan açılır.

---

## 🚀 Kurulum

```bash
npm install
npm run dev        # frontend → http://localhost:5173  |  API → http://localhost:3001
```

Topoloji/sayfa görsellerini PDF'ten yeniden üretmek istersen (opsiyonel):

```bash
pip install pymupdf
python scripts/pdf_to_png.py
```

| Komut | İş |
|---|---|
| `npm run dev` | Vite (5173) + Express API (3001), birlikte (`concurrently`) |
| `npm test` | Vitest — IOS emülatörü + grader + golden replay testleri |
| `npm run validate:items` | `data/items/*.json` → `data/_schema.json` (ajv) doğrulaması |
| `npm run build` | Vite production build |

---

## 🧠 Mimari

```
┌──────────────────────────────┐        ┌───────────────────────────────────────┐
│  Frontend (Vite + React 18)  │  HTTP  │  Backend (Express + TypeScript)        │
│  • xterm.js terminal         │ <────► │  • IOS emülatörü  server/ios/          │
│  • topoloji zoom / pan       │        │  • grader         server/grader/       │
│  • puanlama raporu           │        │  • 40 lab item    data/items/*.json    │
└──────────────────────────────┘        └───────────────────────────────────────┘
```

- **IOS emülatörü** (`server/ios/`) — saf fonksiyon `execute(deviceState, input)`. Mod yığını
  makinesi, komut-deseni gramer tabloları, parent/child config ağacı, kısaltma açma, interface
  adı normalleştirme ve gerçekçi hatalar (`% Invalid input detected`, `% Incomplete command`,
  `% Ambiguous command`).
- **Grader** (`server/grader/`) — son running-config ağacını yol bazında karşılaştırır:
  `required`, `required_any_of`, `path_alias` (exporter/monitor/sla/acl adı ikamesi),
  `forbidden` regex ve `require_save`.
- **Golden replay** (`server/__tests__/replay.test.ts`) — her item'ın `answer_key_raw` cevabı
  emülatörden geçirilir; **tam puan + sıfır hata + kaydedilmiş** olması doğrulanır. Bu, gramer
  ile notlandırmanın her zaman tutarlı kalmasını garanti eder.

**Stack:** Vite · React 18 · TypeScript (strict) · TailwindCSS v4 · xterm.js · react-zoom-pan-pinch · Express · Node.js

---

## 📚 Konu kapsamı (40 lab item)

Soru bankası **OSPF · EIGRP · BGP · EtherChannel/STP · VRF/GRE/IPsec · NetFlow · SPAN ·
IP SLA · CoPP · ACL** konularını kapsar. Örnekler:

| # | Konu | Özet |
|---|------|------|
| 2 | span, ip-sla | SPAN session 2 (çoklu kaynak) + IP SLA — **golden referans** |
| 7 | ospf | OSPF interface-based + area range |
| 9 | vrf, gre, static-routing | Finance VRF + Tunnel10 + VRF statik rota |
| 11 | etherchannel, stp | LACP Po + STP root (VLAN 10, 20) |
| 19 | vrf, gre, ipsec | CORP VRF over GRE + IPsec profil koruması |
| 22 | bgp | eBGP R3 (AS 65300) address-family + Loopback duyurma |
| 27 | eigrp, acl, copp | EIGRP ACL 151 + CoPP SSH 10000 bps |
| 35 | netflow, span, ip-sla | NetFlow + IP SLA (300s) + SPAN session 12 |

> Tam liste için `data/items/` klasörüne bak. (16 ve 18 numaralı ID'ler, kaynak dökümanda
> tekrar/çıkarılamayan içerik olduğu için atlanmıştır — toplam **40 aktif** item mevcuttur.)

### Yeni item eklemek

1. Kaynak sayfayı oku, soru + cevabı çıkar.
2. `data/items/item-XX.json` yaz (şema: `data/_schema.json`, referans: `item-02.json`).
3. Topolojiyi kırp → `public/assets/items/item-XX/topology.png`.
4. Gerekirse `server/ios/grammar.ts`'e eksik komut gramerini ekle.
5. `npm test` (golden replay) ve `npm run validate:items` yeşil olmalı.

---

## ✅ Durum

- [x] **Faz 0** — iskelet (`npm run dev` çalışıyor)
- [x] **Faz 1** — soru bankası: 40/40 item, hepsi şemaya uygun
- [x] **Faz 2** — IOS CLI emülatörü + `Tab` tamamlama + `?` yardımı
- [x] **Faz 3** — grader + golden replay testleri (**64/64 test yeşil**)
- [x] **Faz 4** — sınav arayüzü (terminal, topoloji zoom/pan, puanlama raporu, lab sıfırlama)

---

## ⚠️ Not

Bu proje **eğitim ve pratik amaçlıdır**; resmi Cisco sınavlarıyla veya Cisco Systems ile
bir bağlantısı yoktur. Cisco, IOS ve CCNP, sahiplerinin ticari markalarıdır.
