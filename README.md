# Shakkivalmentaja

Shakkilauta, johon syötetään siirrot ja Stockfish näyttää parhaat jatkot nuolina. Sovellus analysoi koko pelin, merkitsee virheet, hakee omat pelit Lichessistä ja Chess.comista, ja sillä voi pelata konetta vastaan. Pelikirjasto tallentaa analysoidut pelit laitteelle (IndexedDB), ja omista virheistä kootaan kertaavia harjoitustehtäviä. Aloittelijatila selittää siirrot sanoin, ja Opi pelaamaan -opetus näyttää tehtävinä, miten kukin nappula liikkuu.

Sovellus: https://shakkivalmentaja.web.app

## Rakenne

| Tiedosto | Mitä se on |
|---|---|
| `shakkivalmentaja.html` | Koko sovellus yhdessä tiedostossa. Tätä muokataan. |
| `build.js` | Tekee siitä Firebase-version: `public/index.html` (Stockfish 19, pelien haku, PWA) ja `public/sw.js`. |
| `public/` | Firebase Hostingin tiedostot: moottori, chess.js, kuvakkeet, manifesti. |
| `tests/` | Selaintestit headless-Chromella. |
| `tools/make_icons.py` | Luo sovelluksen kuvakkeet (vaatii Pillow-kirjaston). |

Sama `shakkivalmentaja.html` toimii myös sellaisenaan claude.ai-artifactina, jolloin käytössä on Stockfish 10 CDN:stä eikä pelien hakua ole.

## Komennot

```sh
npm test              # rakentaa ja ajaa kaikki selaintestit (noin 2 min)
npm run test:offline  # sama ilman Lichessiä ja Chess.comia käyttäviä testejä
npm run build         # pelkkä rakennus public/-kansioon
npm run deploy        # julkaisu Firebaseen (rakentaa ensin automaattisesti)
```

Yksittäiset testit: `node tests/run.mjs --only peli,välilehdet`. Testit tarvitsevat Chromen (tai Edgen). Polun voi antaa `CHROME_PATH`-muuttujalla. Kuvakaappaukset tallentuvat kansioon `tests/output/`.

Aja `npm test` ennen julkaisua.

## Huomioita

- Chess.comin kuluvan kuukauden arkisto voi palauttaa virheen, vaikka käyttäjä on olemassa. Haku ohittaa virheelliset kuukaudet ja hakee aiemmista.
- Lichessin rajapinta palauttaa 404, jos selaimen tunniste on `HeadlessChrome` tai curlin oletus. Testit vaihtavat tunnisteen tavalliseksi Chromeksi. Oikeilla käyttäjillä haku toimii normaalisti.
- Moottorin vaihtuessa tarkista `ENGINE_INFO` (`build.js`): Stockfish 10:n arvot skaalataan kertoimella 0,7 (`cpScale`), uusilla versioilla kerroin on 1.
