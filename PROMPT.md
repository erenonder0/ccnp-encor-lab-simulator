# Proje Promptu — CCNP ENCOR Lab Simülatörü (GNS3 benzeri CLI trainer)

> Bu dosyayı VS Code'da proje kökünde `PROMPT.md` (veya `CLAUDE.md`) olarak kaydet ve Claude Code'a
> **"PROMPT.md dosyasını oku ve Faz 0'dan başlayarak uygula"** de.

---

## 0. Rolün ve Amaç

Sen kıdemli bir network otomasyon + full-stack geliştiricisisin. Bana **GNS3/Cisco Lab sınav ekranı gibi çalışan, tarayıcıda açılan bir lab simülatörü** yapacaksın.

Akış şu şekilde olacak:

1. Uygulama bana dump'tan gelen bir **lab sorusunu** gösterir (Guidelines + Tasks + topoloji görseli + cihaz tabloları).
2. Ben ekrandaki **CLI terminaline** (R1, Sw1, PC1... sekmeleri) gerçek Cisco IOS komutlarını yazarım.
3. Terminal **sahte bir IOS emülatörü** gibi davranır: prompt değiştirir (`R1>`, `R1#`, `R1(config)#`, `R1(config-flow-exporter)#` ...), hatalı komuta IOS hata mesajı verir, `show run` çıktısı üretir.
4. Ben `Kontrol Et` (grade) dediğimde, sistem cihazların **son konfigürasyon durumunu (running-config)** cevap anahtarıyla karşılaştırır.
5. Sonuç: her task için ✅/❌, eksik satırlar, yanlış satırlar, puan; ardından **resmi çözüm** (dump'taki cevap) gösterilir.

**Kritik tasarım kararı:** Değerlendirme, tuş tuşuna komut eşleşmesine göre DEĞİL, **cihazın ulaştığı nihai konfigürasyon durumuna göre** yapılacak. Yani `conf t` / `configure terminal`, `int e0/0` / `interface Ethernet0/0` gibi kısaltmalar, komut sırası farkı ve fazladan doğru satırlar cezalandırılmaz — hedef durum sağlanmışsa doğrudur.

---

## 1. Girdi Materyali

- `input/CCNP_ENCOR_LAB_June_2026.pdf` → 90 sayfa, **taranmış/görsel** PDF (metin katmanı YOK, `pdftotext` boş döner). Yaklaşık **40 lab item'ı** içeriyor ("Item X of 40 (Lab, Qn)" başlıklarıyla).
- Her item tipik olarak: 1 sayfa **soru** (Guidelines + Tasks + topoloji şeması + IP tablosu) + 1–2 sayfa **cevap** (A şıkkı içinde tam CLI transkripti).
- Görsellerde **SPOTO / ccciedump / tarih-saat watermark'ları** var. Bunları transkripsiyona **dahil etme**, gürültü olarak yok say.

---

## 2. Teknoloji Yığını (bunlara sadık kal)

- **Frontend:** Vite + React + TypeScript, TailwindCSS, `xterm.js` (terminal), `react-zoom-pan-pinch` (topoloji görselini büyütmek için).
- **Backend:** Node.js + Express + TypeScript (tek repo, `server/`). IOS emülatörü ve grader **backend'de** çalışır, state server tarafında tutulur (`session` bazlı, bellek içi + `data/progress.json` ile kalıcı).
- **Veri:** Soru bankası düz JSON dosyaları (`data/items/item-XX.json`), görseller `public/assets/items/item-XX/*.png`.
- **Test:** Vitest. En az IOS parser ve grader için birim testleri.
- Veritabanı, Docker, auth **YOK**. `npm run dev` ile tek komutta ayağa kalksın.

---

## 3. Klasör Yapısı

```
ccnp-encor-lab/
├─ input/CCNP_ENCOR_LAB_June_2026.pdf
├─ scripts/
│  ├─ pdf_to_png.py            # PDF -> sayfa PNG'leri (PyMuPDF)
│  └─ crop-topology.ts         # soru sayfasından topoloji bölgesini kırpma (sharp)
├─ data/
│  ├─ items/item-01.json ... item-40.json
│  ├─ _schema.json             # item şeması (JSON Schema)
│  └─ progress.json            # kullanıcı ilerlemesi/puanları
├─ server/
│  ├─ index.ts                 # Express API
│  ├─ ios/
│  │  ├─ device.ts             # Device state, running-config ağacı, startup-config
│  │  ├─ parser.ts             # komut normalizasyonu + kısaltma açma
│  │  ├─ modes.ts              # exec/priv/config/sub-config mod makinesi
│  │  ├─ commands/             # her komut ailesi ayrı dosya (interface, vlan, netflow, sla, span, ospf, bgp...)
│  │  └─ show.ts               # show run, show run | sec X, show flow exporter, show ip int brief...
│  └─ grader/
│     ├─ grade.ts              # nihai state vs required_state karşılaştırma
│     └─ normalize.ts
├─ src/                        # React frontend
│  ├─ components/QuestionPanel.tsx  # Guidelines + Tasks + IP tablosu
│  ├─ components/TopologyView.tsx   # topoloji görseli (zoom/pan)
│  ├─ components/Terminal.tsx       # xterm.js + cihaz sekmeleri
│  ├─ components/GradeReport.tsx    # sonuç + resmi çözüm
│  └─ pages/Lab.tsx
└─ PROMPT.md
```

---

## 4. Faz 0 — Kurulum ve İskelet

> **Ortam notu (Windows 11):** Bu makinede `pdftoppm`, `magick`, `mutool`, `gs` YOK; `node`, `npm` ve `python` (3.14, `C:\Python314\python.exe`) VAR. Shell PowerShell 5.1'dir (`&&` zincirleme çalışmaz). PDF'i sayfa görsellerine çevirmek için **PyMuPDF** kullan — harici binary gerektirmez.

1. Repoyu yukarıdaki yapıyla kur, `npm run dev` ile frontend (5173) + backend (3001) beraber ayağa kalksın (`concurrently`).
2. `pip install pymupdf` sonrası `scripts/pdf_to_png.py`:
   ```python
   import fitz  # PyMuPDF
   doc = fitz.open("input/CCNP_ENCOR_LAB_June_2026.pdf")
   for i, page in enumerate(doc, start=1):
       pix = page.get_pixmap(dpi=200)
       pix.save(f"work/page-{i:02d}.png")
   ```
   → `work/page-01.png ... page-90.png`. PNG'ler üretildikten sonra sayfaları Read aracıyla görsel olarak okuyabilirsin.

   > **NOT — bu adım zaten yapıldı:** `work/page-01.png ... page-90.png` (90 sayfa, 200 dpi) proje kökünde hazır. PyMuPDF kurulu. Doğrudan Faz 1'e (görselleri okuyup item JSON'ları çıkarmaya) geçebilirsin. Sayfa 3 = Item 2 sorusu, sayfa 4 = Item 2 cevabı (aşağıdaki altın örnekle doğrulandı).

---

## 5. Faz 1 — Soru Bankasının Çıkarılması (EN ÖNEMLİ AŞAMA)

PDF'te metin katmanı olmadığı için sayfaları **görsel olarak okuyacaksın** (`view` ile PNG'leri aç, gerekiyorsa `sharp` ile 2x büyütüp bölgelere ayır).

**Kurallar:**
- Sayfaları **5'erli batch** hâlinde işle; her batch sonrası ilgili `data/items/item-XX.json` dosyalarını yaz ve bana kısa bir özet ver (hangi item, hangi teknoloji, hangi sayfalar).
- Cevap sayfalarındaki CLI transkriptini **satır satır, birebir** al (`answer_key_raw`). Komutları uydurma; okunamayan bir yer varsa `"review": true` bayrağı koy ve bana bildir, **tahmin etme**.
- Cevaptaki `###Please run 'show ...' to verify ...` şeklindeki notlar sınav ipuçlarıdır → `hints[]` alanına ayrı yaz, config satırı olarak sayma.
- Topoloji şemasını soru sayfasından kırp → `public/assets/items/item-XX/topology.png`. Ayrıca cihaz/IP tablosunu **yapısal olarak** `device_table[]` alanına da yaz (metin olarak da görünmesi için).
- Item şeması `data/_schema.json` ile doğrulansın (ajv). Her JSON yazımında validate et.

### Item JSON şeması (referans örnek — Item 2, elimde tam hâli var, birebir bunu üret)

```jsonc
{
  "id": 2,
  "source_pages": [3, 4],
  "title": "Monitoring: Flexible NetFlow Exporter, SPAN, IP SLA HTTP",
  "topics": ["netflow", "span", "ip-sla"],
  "difficulty": "medium",
  "guidelines": [
    "Refer to the Tasks tab to view the tasks for this lab item.",
    "Refer to the Topology tab to access the device console(s) and perform the tasks.",
    "Console access is available for all required devices.",
    "All necessary preconfigurations have been applied.",
    "Do not change the enable password or hostname for any device.",
    "Save your configurations to NVRAM before moving to the next item."
  ],
  "tasks": [
    "Complete the Flexible NetFlow Flow Exporter configuration on R1 to send data to the collector located at 10.10.1.10.",
    "Configure the switch port analyzer on Sw1 and mirror all communication to and from PC1 and PC2 to interface E1/0 using session number 2.",
    "Configure a basic IP SLA HTTP GET operation on R1 to monitor the server at 10.10.1.100 every 600 seconds."
  ],
  "topology_image": "/assets/items/item-02/topology.png",
  "device_table": [
    { "device": "R1",  "interface": "e0/0",    "ip": "10.10.1.2" },
    { "device": "Sw1", "interface": "VLAN 10", "ip": "10.10.1.1" },
    { "device": "Sw1", "interface": "VLAN 12", "ip": "10.12.1.1" },
    { "device": "Sw1", "interface": "VLAN 14", "ip": "10.14.1.1" },
    { "device": "PC1", "interface": "VLAN 12", "ip": "10.12.1.2" },
    { "device": "PC2", "interface": "VLAN 14", "ip": "10.14.1.2" }
  ],
  "devices": [
    {
      "name": "R1",
      "type": "ios-router",
      "enable_password": "cisco",
      "interfaces": ["Ethernet0/0"],
      // "All necessary preconfigurations have been applied" → sınavdaki gibi ön-config:
      "preconfig": [
        "hostname R1",
        "interface Ethernet0/0",
        " ip address 10.10.1.2 255.255.255.0",
        "flow exporter Export-NetFlowENCOR",
        " transport udp 9995",
        "ip sla 10"
      ]
    },
    {
      "name": "Sw1",
      "type": "ios-switch",
      "interfaces": ["Ethernet0/0", "Ethernet0/1", "Ethernet0/2", "Ethernet1/0"],
      "preconfig": ["hostname Sw1"]
    },
    { "name": "PC1", "type": "pc" },
    { "name": "PC2", "type": "pc" }
  ],
  "grading": {
    "require_save": true,          // 'write' / 'copy run start' yapılmazsa uyar (puan kırma opsiyonel)
    "checks": [
      {
        "task": 1,
        "device": "R1",
        "points": 3,
        "required": [
          { "path": ["flow exporter Export-NetFlowENCOR"], "line": "destination 10.10.1.10" }
        ],
        "path_alias": "exporter_name"   // ön-config'te isim farklıysa gerçek isme göre eşleşsin
      },
      {
        "task": 2,
        "device": "Sw1",
        "points": 4,
        "required_any_of": [
          [
            { "path": [], "line": "monitor session 2 source interface Ethernet0/1,Ethernet0/2 both" },
            { "path": [], "line": "monitor session 2 destination interface Ethernet1/0" }
          ],
          [
            { "path": [], "line": "monitor session 2 source interface Ethernet0/1 both" },
            { "path": [], "line": "monitor session 2 source interface Ethernet0/2 both" },
            { "path": [], "line": "monitor session 2 destination interface Ethernet1/0" }
          ]
        ]
      },
      {
        "task": 3,
        "device": "R1",
        "points": 3,
        "required": [
          { "path": ["ip sla 10"], "line": "http get http://10.10.1.100" },
          { "path": ["ip sla 10"], "line": "frequency 600" },
          { "path": [], "line": "ip sla schedule 10 life forever start-time now" }
        ]
      }
    ],
    "forbidden": [
      { "device": "*", "regex": "^hostname (?!R1$|Sw1$)" },
      { "device": "*", "regex": "^enable (secret|password)" }
    ]
  },
  "hints": [
    "R1'de 'show flow exporter' ile exporter adının Export-NetFlowENCOR olup olmadığını doğrula; farklıysa ön-config'teki gerçek adı kullan.",
    "R1'de 'show run | sec sla' ile SLA ID'nin 10 olup olmadığını doğrula."
  ],
  "answer_key_raw": "R1> enable\nR1# configure terminal\nR1(config)# flow exporter Export-NetFlowENCOR\nR1(config-flow-exporter)# destination 10.10.1.10\nR1(config-flow-exporter)# exit\nR1(config)# ip sla 10\nR1(config-ip-sla)# http get http://10.10.1.100\nR1(config-ip-sla-http)# frequency 600\nR1(config-ip-sla-http)# exit\nR1(config)# ip sla schedule 10 life forever start-time now\nR1(config)# end\nR1# write\n\nSw1> enable\nSw1# configure terminal\nSw1(config)# monitor session 2 source interface e0/1,e0/2 both\nSw1(config)# monitor session 2 destination interface e1/0\nSw1(config)# end\nSw1# write",
  "explanation": "NetFlow'da exporter altında collector IP'si 'destination' ile verilir. SPAN'de kaynak portlar 'both' yönüyle, hedef port ayrı satırda tanımlanır. IP SLA HTTP GET'te frequency saniye cinsindendir ve operasyon 'ip sla schedule' ile başlatılmadıkça çalışmaz.",
  "review": false
}
```

Faz 1 çıktısı: **40 item'ın tamamı** bu şemada, `answer_key_raw` birebir dump'tan, `grading.checks` cevaptan türetilmiş hâlde.

---

## 6. Faz 2 — IOS CLI Emülatörü (`server/ios/`)

Gerçek IOS'u taklit et; amaç öğrenciyi ezberden değil, mantıktan sınamak.

**Mod makinesi:**
| Mod | Prompt | Giriş | Çıkış |
|---|---|---|---|
| user exec | `R1>` | başlangıç | `enable` → priv |
| privileged | `R1#` | `enable` | `disable`, `exit` |
| global config | `R1(config)#` | `configure terminal` | `exit`, `end`, `Ctrl+Z` |
| interface | `R1(config-if)#` | `interface X` | `exit` |
| flow exporter | `R1(config-flow-exporter)#` | `flow exporter NAME` | |
| flow record/monitor | `(config-flow-record)#` / `(config-flow-monitor)#` | | |
| ip sla | `R1(config-ip-sla)#` | `ip sla N` | |
| ip sla http/icmp-echo | `(config-ip-sla-http)#`, `(config-ip-sla-echo)#` | | |
| router | `R1(config-router)#` | `router ospf/eigrp/bgp` | |
| vlan / line / acl vb. | ilgili prompt | | |

**Gereksinimler:**
1. **Kısaltma desteği:** `conf t`, `int e0/1`, `sh run`, `wr`, `en`, `no shut` → tam komuta genişlet. Ambiguous kısaltma → `% Ambiguous command: "..."`.
2. **Interface isim normalizasyonu:** `e0/1`, `eth0/1`, `Ethernet0/1` → hepsi `Ethernet0/1`. Aralık: `interface range e0/1 - 2`.
3. **Hata mesajları gerçekçi olsun:**
   - `% Invalid input detected at '^' marker.` (şapka doğru kolonda!)
   - `% Incomplete command.`
   - `% Ambiguous command: "co"`
   - Config modunda değilken config komutu → aynı invalid input hatası.
4. **running-config ağacı:** satırlar parent/child ilişkisiyle tutulsun (girinti IOS'taki gibi). `no <komut>` satırı siler.
5. **show komutları (en az):** `show running-config`, `show running-config | section X`, `show running-config | include X`, `show ip interface brief`, `show flow exporter`, `show flow monitor`, `show monitor session all`, `show ip sla configuration`, `show vlan brief`, `show ip route`, `show version`, `show cdp neighbors`. Çıktılar **cihazın gerçek state'inden** üretilsin, hard-code metin olmasın.
6. **Kayıt:** `write`, `write memory`, `copy running-config startup-config` → `startup_config = running_config` + `Building configuration...` `[OK]` çıktısı.
7. **PC cihazları:** sadece `ping`, `ipconfig`/`show ip` gibi minimal komutlar (topolojiye göre sahte cevap).
8. `?` yardımı ve **Tab-completion** (bonus, mümkünse yap), yukarı/aşağı ok ile komut geçmişi (xterm tarafında).
9. Emülatör **pure function** olarak yazılsın: `execute(deviceState, inputLine) -> { deviceState, output, prompt }`. Böylece test edilebilir olur.

---

## 7. Faz 3 — Grader (`server/grader/`)

- Girdi: item'ın `grading` bloğu + her cihazın **nihai running-config ağacı**.
- Normalizasyon: küçük harfe indirme (isimler hariç — `flow exporter` adı **case-sensitive** kalsın), fazla boşluk temizleme, interface isimlerini tam forma çevirme, `e0/1,e0/2` gibi listeleri sıralı set'e çevirme.
- `required` → hepsi sağlanmalı. `required_any_of` → alternatiflerden biri yeterli.
- `path_alias`: ön-config'te isim/ID farklıysa (exporter adı, SLA ID) gerçek değere göre eşleştir.
- `forbidden` regex'leri ihlal edilmişse task fail + açıklama.
- `require_save: true` ise `startup_config != running_config` durumunda uyarı: "NVRAM'e kaydetmedin (`write`)".
- Çıktı raporu (task bazında):
  ```
  Task 2 — SPAN (Sw1)   ❌ 2/4
    ✅ monitor session 2 destination interface Ethernet1/0
    ❌ Eksik: monitor session 2 source interface Ethernet0/1,Ethernet0/2 both
       Sende: monitor session 2 source interface Ethernet0/1 rx
       Neden: PC1 ve PC2'ye giden VE gelen trafik isteniyor → yön 'both' olmalı ve iki port da kaynak olmalı.
  ```
- Rapordan sonra `answer_key_raw` (resmi çözüm) + `explanation` gösterilsin. **Ama kullanıcı `Kontrol Et` demeden cevabı asla gösterme.**

---

## 8. Faz 4 — Arayüz (sınav ekranına benzesin)

- Üst bar: `Item X of 40 (Lab, Qn)` • Timer • `Kontrol Et` • `Sonraki Item` • `Sıfırla`.
- Sol panel sekmeleri: **Guidelines | Tasks | Topology** (dump'taki gibi). Topology sekmesinde görsel + IP tablosu, cihaz ikonuna tıklayınca o cihazın konsolu açılır.
- Sağ panel: **xterm.js terminali**, üstte cihaz sekmeleri (R1 / Sw1 / PC1 / PC2). Her cihazın kendi geçmişi ve modu korunur.
- `Kontrol Et` → `GradeReport` modalı: task bazlı puan, eksik/yanlış satırlar, ardından "Resmi Çözümü Göster" butonu.
- Karanlık tema, terminal monospace, IOS renkleri. Mobil şart değil.
- Ekstra modlar (yapabilirsen):
  - **Practice:** ipuçları açık, sınırsız `Kontrol Et`.
  - **Exam:** 40 item sıralı, timer, tek deneme, sonunda toplam skor + zayıf konu raporu (topics bazında).
  - **Random drill:** yalnızca yanlış yaptığım item'ları tekrar sor (`data/progress.json`'dan).

---

## 9. API Sözleşmesi

```
GET  /api/items                      -> [{id, title, topics, difficulty, solved}]
GET  /api/items/:id                  -> item (answer_key_raw ve grading HARİÇ)
POST /api/session/:itemId/start      -> {sessionId, devices:[{name, prompt}]}
POST /api/session/:sessionId/exec    -> {device, input} => {output, prompt}
POST /api/session/:sessionId/grade   -> {score, max, tasks:[...], missing:[...], extra:[...], saved:bool}
GET  /api/session/:sessionId/answer  -> {answer_key_raw, explanation}   // yalnızca grade sonrası
POST /api/session/:sessionId/reset
```

---

## 10. Çalışma Disiplini (bana nasıl rapor vereceksin)

1. **Her fazı bitirdiğinde dur**, ne yaptığını 5 satırda özetle ve onay iste. Fazları birleştirme.
2. Faz 1'de her 5 item'da bir dur, çıkardığın JSON'ları göster; hatalı okuma varsa düzeltmemi iste.
3. Emin olmadığın hiçbir CLI komutunu **uydurma**. Bilmiyorsan `"review": true` koy ve sor.
4. Önce **Item 2'yi uçtan uca çalışır hâle getir** (bu item'ın soru + cevap görselleri elimde tam olarak var, referans/altın örnek odur). Item 2 tam çalışmadan diğer 39 item'a geçme.
5. Kod: TypeScript strict, ESLint temiz, IOS parser ve grader için birim testleri (`npm test`) yeşil.
6. `README.md` yaz: kurulum, `npm run dev`, yeni item ekleme rehberi.

---

## 11. Kabul Kriterleri (Definition of Done)

- [ ] `npm run dev` → tarayıcıda Item 2 açılıyor; Guidelines/Tasks/Topology sekmeleri dump'takiyle aynı içerik.
- [ ] R1 terminaline `en` → `conf t` → `flow exporter Export-NetFlowENCOR` → `destination 10.10.1.10` yazınca prompt'lar doğru değişiyor, `show run | sec flow` doğru çıktı veriyor.
- [ ] Yanlış komut → gerçekçi IOS hatası.
- [ ] Doğru çözümü kısaltmalarla (`conf t`, `int e0/1`) yazınca **tam puan** alıyorum.
- [ ] Eksik/yanlış yazınca grader **hangi satırın neden yanlış olduğunu** söylüyor ve resmi çözümü gösteriyor.
- [ ] `write` yapmazsam "NVRAM'e kaydetmedin" uyarısı geliyor.
- [ ] 40 item `data/items/` altında; `review: true` olanların listesi README'de.

---

## 12. İlk Adım

`input/` klasörüne PDF'i koydum. **Faz 0 + Faz 1'in ilk batch'i (Item 1–5)** ile başla; PDF sayfalarını PNG'ye çevir, görselleri oku, `data/items/item-01..05.json` üret ve bana özetle. Sonra dur, onayımı bekle.