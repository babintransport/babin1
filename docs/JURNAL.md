BABIN TRANSPORT – Jurnal de proiect
1. Audit (starea sistemului)

Arhitectură: site static (HTML + Tailwind prin CDN + JavaScript simplu), instalabil ca PWA. Backend: Supabase (PostgreSQL, Auth, Storage, Realtime). Găzduire: GitHub + Vercel. O singură funcție serverless pregătită (api/paj-positions.js), neactivată.

Fișiere: index.html (login, rutare după rol), admin.js (portal administrator), employee.js (portal șofer), chat.js (chat + notificări), sw.js (service worker), config.js (chei publice Supabase + opțiuni), schema.sql (baza de date).

Baza de date: users, vehicles, driver_history, tasks, fuel_logs, defects, group_chat. Bucket-uri private: receipts, defect-photos. Securitate prin RLS pe toate tabelele; funcția is_admin(); trigger care crează rândul din users la cont nou și actualizează kilometrajul la alimentare.

Funcții existente: autentificare e-mail + parolă; admin: Prezentare generală, Flotă (vehicule), Centru de alerte (TÜV, ulei, anvelope), Task-uri, Defecțiuni cu poze, Combustibil (L/100 km, bonuri), Istoric șoferi („Cine conducea?"), Chat cu notificări; șofer: Task-uri, Alimentări cu poza bonului, Defecțiuni, Chat. Harta PAJ: scrisă, ascunsă (ENABLE_MAP).

Probleme cunoscute:

Autentificarea în doi pași prin cod pe e-mail este oprită (REQUIRE_2FA: false); nu este un al doilea factor real.
Notificările chat nu ajung când aplicația este închisă (necesită Web Push).
Rolurile sunt doar admin și employee.
Nu există audit log, curse, documente, finanțe, OCR, export PDF/Excel.
2. Reguli de protecție

Backup înainte de orice versiune nouă (ZIP GitHub + backup Supabase). Fără schimbări de bază de date fără script SQL aditiv. Nicio funcție existentă nu se șterge.

3. Faze
Fază	Conținut	Stare
1	Audit și documentare	făcut (acest document)
2	Backup și mediu	de făcut de proprietar înainte de încărcare
3	Design system (paletă, logo, componente)	făcut în v2.0
4	Redesign dashboard administrator	făcut în v2.0
5	Redesign module administrator	în curs (paleta se aplică tuturor; pagini individuale la următoarele versiuni)
6	Driver Portal (ecran Acasă, vehicul curent, profil)	de făcut
7	Curse, Documente cu expirări, Finanțe, Service, rapoarte PDF/Excel, OCR facturi	de făcut (necesită tabele noi)
8	Roluri extinse, audit log, 2FA cu aplicație Authenticator, verificări securitate	de făcut
9	PAJ GPS live, notificări push, versiune online/mobile	de făcut (PAJ amânat)
4. Jurnal modificări

v2.0 – paletă nouă (Navy #102A49 / #183A5C, Green #16834A, fundal #F4F6F8), logo Babin Transport pe login, bară laterală, antet și portal șofer; dashboard „Prezentare generală" cu indicatori reali, listă flotă, avertizări, activitate recentă și grafic de cost combustibil; clopoțel cu alerte urgente. Fără modificări de bază de date. Fără date demonstrative.

v1.x – autentificare, vehicule, alerte, task-uri, defecțiuni, combustibil, istoric șoferi, chat cu notificări, interval ulei 10.000 km.
