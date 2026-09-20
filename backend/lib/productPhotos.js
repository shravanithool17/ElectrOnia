// lib/productPhotos.js — real product photography for the seed catalogue.
//
// Every photo here is from Unsplash (https://unsplash.com), free to use under
// the Unsplash License (https://unsplash.com/license): commercial use allowed,
// no permission needed, attribution appreciated but not required. We credit
// the photographers anyway — see PHOTO_CREDITS and the storefront footer.
// "Unsplash+" (paid) images were excluded when these were picked.
//
// These are photos of the right KIND of product (a gaming laptop, a round
// smartwatch, a PS5), chosen by eye from Unsplash searches — not official
// manufacturer shots of each exact model. Where Unsplash has the actual device
// (PS5, Xbox, Switch, Steam Deck, AirPods, iPhone, MacBook, Apple Watch,
// Raspberry Pi, JBL, Marshall...) that is what was picked.
//
// Each row is [imageSlug, unsplashPhotoId, photographerUsername]. Photos are
// served by Unsplash's image CDN (images.unsplash.com), which resizes and
// re-encodes on the fly from the query string.
//
// To use the generated SVG art instead (offline demos), set
//   PRODUCT_IMAGES=art
// in .env before seeding.

export const PHOTO_POOLS = {
  macbook: [
    ['photo-1526925712774-2833a7ecd0d4', 'v_1t1DzfAUA', 'rubmenarguez'],
    ['photo-1611186871348-b1ce696e52c9', 'Hin-rzhOdWs', 'nampoh'],
    ['photo-1580522154071-c6ca47a859ad', 'ykI7BeSWgMo', 'hi_roger'],
    ['photo-1625766763788-95dcce9bf5ac', '35DopK36wzw', 'isaacmartin'],
    ['photo-1511385348-a52b4a160dc2', 'tpuAo8gVs58', 'jmckinven'],
    ['photo-1651241680016-cc9e407e7dc3', 'UkpTGYox6RM', 'dlxmedia'],
    ['photo-1629131726692-1accd0c53ce0', '8krX0HkXw8c', 'giorgiotrovato'],
    ['photo-1420406676079-b8491f2d07c8', '0l1QuxkBDUw', 'marcin'],
    ['photo-1657936412057-67a8bb0a04a8', 'Da5_1StN0m8', 'taanhuyn'],
    ['photo-1575024357670-2b5164f470c3', '_sg8nXmpWDM', 'nordwood'],
  ],
  winlaptop: [
    ['photo-1588872657578-7efd1f1555ed', 'i5UV2HpITYA', 'eroneko11'],
    ['photo-1658988332863-0461ddfb6341', 'FAwZCAturoI', 'alexeydemidov'],
    ['photo-1618424181497-157f25b6ddd5', 'MuP--rlVZaA', 'nublson'],
    ['photo-1704360302738-3790789f19b1', '6wazjF6OUvM', 'amanz'],
    ['photo-1593642632823-8f785ba67e45', 'yNvVnPcurD8', 'dell'],
    ['photo-1593642531955-b62e17bdaa9c', '2L-0vnCnzcU', 'dell'],
    ['photo-1648197395199-e7f8d3dd0a3c', 'bf2ZA4oB8-M', 'rresenden'],
    ['photo-1724960996795-11a4e709ae84', 'Guoh4Xpv2m4', 'jaimemarrero'],
    ['photo-1593642532973-d31b6557fa68', 'YNliXm_hMn8', 'dell'],
    ['photo-1565375706404-082d37dd1f5d', 'IjEsNibC4pc', 'yapics'],
    ['photo-1593642702821-c8da6771f0c6', 'Gi3iUJ1FwxI', 'dell'],
    ['photo-1555117391-6c0795768da8', 'aUnkqeCvz80', 'jibarox'],
  ],
  gaming: [
    ['photo-1696710257827-75e2e5954059', '2rQoMZLVXHc', 'sdlsanjaya'],
    ['photo-1640955014216-75201056c829', 'auf3GwpVaOM', 'onurbinay'],
    ['photo-1640695257754-7e2932f9ad0f', '5IB2fQHVvm4', 'clastr'],
    ['photo-1603302576837-37561b2e2302', 'lzh3hPtJz9c', 'joshuaworoniecki'],
    ['photo-1611078489935-0cb964de46d6', 'SqLyNHbsLKQ', 'artinbakhan'],
    ['photo-1583223667854-e0e05b1ad4f3', 'tqWIGez5AsI', 'jerrografie'],
    ['photo-1605134513573-384dcf99a44c', '5Mw0JlOjtTc', 'usualmorals'],
    ['photo-1531297484001-80022131f5a1', 'Im7lZjxeLhg', 'alesnesetril'],
  ],
  convertible: [
    ['photo-1644953798828-a92178929505', 'Y0oAladtxeA', 'joshuabeny1999'],
    ['photo-1599128398046-06108ed53e3c', 'qiUiIfRg_qw', 'mralidoost'],
    ['photo-1624505211449-2867a652a772', 'ww3ZTXQkERE', 'sebastiaanchia'],
    ['photo-1662221356784-14b60d842253', 'snSCyhHoCLY', 'zelebb'],
    ['photo-1679206910757-2a6222b121ca', 'Gyr7RTRhNJY', 'hcphotos'],
  ],
  iphone: [
    ['photo-1592750475338-74b7b21085ab', 'DV0mB2uJM34', 'filipbaotic'],
    ['photo-1726587912121-ea21fcc57ff8', 'lDWTfYhZ85w', 'omilaev'],
    ['photo-1609692814858-f7cd2f0afa4f', 'YLNMXzXk8zs', 'dnnsbrndl'],
    ['photo-1736173155811-e8142fd553ee', 'zxi4HT2Rww8', 'visualsbying'],
    ['photo-1591337676887-a217a6970a8a', 'OxvlDO8RwKg', 'vuatao'],
    ['photo-1616410011236-7a42121dd981', 'OKjJZNTl004', 'onurbinay'],
    ['photo-1511707171634-5f897ff02aa9', 'xsGxhtAsfSA', 'hckmstrrahul'],
    ['photo-1510557880182-3d4d3cba35a5', 'A6JxK37IlPo', 'bhaguz'],
    ['photo-1596558450268-9c27524ba856', 'A6qNzfJXRGQ', 'thombradley'],
  ],
  samsung: [
    ['photo-1738830234395-a351829a1c7b', 'mzNVfDZMUPA', 'amanz'],
    ['photo-1706300896423-7d08346e8dbb', '41zMcmdNXrk', 'dhruva15'],
    ['photo-1738830223726-151adcd58131', 'O9yA4Lk6kzE', 'amanz'],
    ['photo-1772182098948-68e2818e9293', 'femO7LRLORM', 'amanz'],
    ['photo-1738830251513-a7bfef4b53c6', 'fYru5LNyJiM', 'amanz'],
    ['photo-1772182137994-4158ac33bddd', 'V-iFRXuuBeQ', 'amanz'],
    ['photo-1610945265064-0e34e5519bbf', 'PdALQmfEqvE', 'anhnhat1205'],
    ['photo-1707438095940-1eee18e85400', 'H8-mb0OBx6s', 'n3gve'],
    ['photo-1709744722656-9b850470293f', 'lkhz29AXTTc', 'bobby17'],
    ['photo-1610792516307-ea5acd9c3b00', 'YKFBdV-RRXI', 'anhnhat1205'],
    ['photo-1610792516820-2bff50c652a2', 'whIInzoSukc', 'anhnhat1205'],
  ],
  android: [
    ['photo-1598965402089-897ce52e8355', 'aiUAxBNe3Xk', 'rmrdnl'],
    ['photo-1612442443556-09b5b309e637', 'K12SrkaZuCg', 'adrien'],
    ['photo-1555774698-0b77e0d5fac6', '70ku6P7kgmc', 'christianw'],
    ['photo-1640936343842-268f9d87e764', 'aD6mY43V_QQ', 'masakaze'],
    ['photo-1696695368125-fc0d809b4ab5', 'N9UHhfw9-p0', 'indraprojects'],
    ['photo-1521939094609-93aba1af40d7', 'kknrCfZHsyo', 'masakaze'],
    ['photo-1663245482988-22fad02654e3', 'lfXc-8Ndh1Y', 'zelebb'],
    ['photo-1587749090881-1ea18126ab3a', 'iFx7C49l5o8', 'abeso'],
    ['photo-1607270788732-55d2cdb8f52a', 'KbpjCGIcfbo', 'ali_alipli'],
    ['photo-1599016012665-13b74bb3b528', 'Z9fW8Nn7D24', 'rmrdnl'],
    ['photo-1544866092-1935c5ef2a8f', 'OYMKjv5zmGU', 'viktortalashuk'],
  ],
  pixel: [
    ['photo-1727132528094-117c9dceb047', 'zsBPSaTbF5E', 'triyansh'],
    ['photo-1756517313520-c6c25364ce65', 'O6Or-El4hdU', 'sammysays___'],
    ['photo-1635870723802-e88d76ae324e', 'PE97QBw-LHc', 'triyansh'],
    ['photo-1729302784412-c36bbab2a6ef', 'IHkYPDanoUg', 'sammysays___'],
    ['photo-1724322535079-11b08f7f5c88', 'MuGEpHK8S4k', 'amanz'],
    ['photo-1724438192699-89f587b04c24', 'oALMJ8tpnBs', 'sammysays___'],
    ['photo-1706412703794-d944cd3625b3', 'PJt3gKDVuTU', 'sammysays___'],
    ['photo-1727941035071-910fd07135bb', 'QNnpRKMlyqc', 'ar7work'],
    ['photo-1727132527836-a392cf3f07aa', 'tb5m9PsvMKE', 'triyansh'],
    ['photo-1724341039339-036842055cae', '8e2VsJ0dOPM', 'sammysays___'],
    ['photo-1659080382102-176e51b4f5f4', 'KPtcdvXYRlA', 'amjiths'],
  ],
  overear: [
    ['photo-1505740420928-5e560c06d30e', 'PDX_a_82obo', 'cdx2'],
    ['photo-1618366712010-f4ae9c647dcb', 'lUMj2Zv5HUE', 'ldpeterson11'],
    ['photo-1546435770-a3e426bf472b', 'YDZPdqv3FcA', 'gawlowski'],
    ['photo-1641048930621-ab5d225ae5b0', '0QAe85hi_Mw', 'cosminursea'],
    ['photo-1585298723682-7115561c51b7', 'oXXc-s5nNy8', 'kamiseba'],
    ['photo-1520170350707-b2da59970118', 'NehdOHCXsjs', 'totteannerbrink'],
    ['photo-1487215078519-e21cc028cb29', 'Qrspubmx6kE', 'septillion'],
    ['photo-1599669454699-248893623440', 'xR4JHzr69Og', 'ninjason'],
    ['photo-1505740106531-4243f3831c78', 'dBwadhWa-lI', 'cdx2'],
    ['photo-1693621947585-7b7d94149af4', 'W_lXhs-q-sI', 'hazelz'],
    ['photo-1693895592595-9171d91a0f22', 'cqJZAlkjnug', 'phant0meyes'],
    ['photo-1583394838336-acd977736f90', 'LSNJ-pltdu8', 'kiranck123'],
    ['photo-1613040809024-b4ef7ba99bc3', 'Zam8TvEgN5o', 'ervorocks'],
    ['photo-1612444530582-fc66183b16f7', 'por3FNwFCbs', 'mayramoretti'],
  ],
  airpodsmax: [
    ['photo-1609081219090-a6d81d3085bf', 'Q2uV5TkjNz8', 'justaguyintech'],
    ['photo-1625245488763-0657f416a6ff', 'FBCTu9BuVlU', 'mattbirchler'],
    ['photo-1625245488600-f03fef636a3c', 'IaTuyBQ4gTw', 'mattbirchler'],
    ['photo-1612116454817-2b0841e30eaf', 'ax23KYiUdJc', 'ravipalwe'],
    ['photo-1655628143559-d6ab5a201c9c', '2sBZHbM6eAY', 'saneryee'],
    ['photo-1613093691025-8a07cf2d1e4b', 'bWqFxSqYTR8', 'ravipalwe'],
    ['photo-1655628143563-a4b1c60de33d', '-lnvREpbLu0', 'saneryee'],
    ['photo-1616661318204-51ededbdf7a8', 'lD1OLuSf9GU', 'theblowup'],
  ],
  earbuds: [
    ['photo-1655560378428-7605bda51749', '_h50cvQCj_M', 'yasin'],
    ['photo-1578319439584-104c94d37305', 'HuTUDQqr88c', 'hi_roger'],
    ['photo-1722439667098-f32094e3b1d4', 'ymfiokQznTo', 'explorimagine'],
    ['photo-1667178173387-7e0cb51c0b4f', 'NBP7p4qWzYs', 'yogeshppl'],
    ['photo-1606220588913-b3aacb4d2f46', 'qt9_OfTaaeY', 'theregisti'],
    ['photo-1606220945770-b5b6c2c55bf1', 'YwJGDLKOE48', 'theregisti'],
    ['photo-1668649176554-3ad841a780d0', 'dQiqWGj847c', 'gibson_photographic'],
    ['photo-1627989580309-bfaf3e58af6f', 'IpIqJwxdiog', 'creativemomentsphotography09'],
    ['photo-1632200004922-bc18602c79fc', 'XGIulH5L8lU', 'behy_studio'],
    ['photo-1590658268037-6bf12165a8df', '6V5vTuoeCZg', 'rmrdnl'],
  ],
  airpods: [
    ['photo-1572569511254-d8f925fe2cbb', 'AgLMrojqjAM', 'rmrdnl'],
    ['photo-1580477371194-4593e3c7c6cf', 'wscuT4NtHXE', 'nidheeshkavalan'],
    ['photo-1606741965429-8d76ff50bb2f', 'r8rYXthJOZw', 'insungpandora'],
    ['photo-1682939960849-60f4098b4b39', 'CcKvxIPOg7o', 'jaimemarrero'],
    ['photo-1606841837239-c5a1a4a07af7', 'Mc5EwlPC3zA', 'john_smit'],
    ['photo-1606741965326-cb990ae01bb2', 'mru38VH7tII', 'insungpandora'],
    ['photo-1588156979435-379b9d365296', 'dOj90TiZhAM', 'davidleveque'],
    ['photo-1611864583067-b002fdc4fa29', '3p5cPfbpVTc', 'miketopus'],
    ['photo-1587523459887-e669248cf666', '6hQB-U2nWG8', 'andresjasso'],
    ['photo-1600294037681-c80b4cb5b434', 'mx4oQdFJ2rY', 'dagny_2020'],
    ['photo-1603351154351-5e2d0600bb77', 'gSZCLsE7ysc', 'itsomidarmin'],
  ],
  speaker: [
    ['photo-1608043152269-423dbba4e7e1', 'g5Y5kjOwGwQ', 'nejc_soklic'],
    ['photo-1665672629999-0994c3f052a9', '-SVo-s9ifIU', 'iantalmacs'],
    ['photo-1589001181560-a8df1800e501', '6HDoRL0Y_-w', 'habibdadkhah'],
    ['photo-1594501432907-91214bfdd928', '_bWH-4OjrYA', 'galex'],
    ['photo-1674303324806-7018a739ed11', 'AEKiPkCfv5c', 'zelebb'],
    ['photo-1612795146974-84dbe538f4a4', 'YcEISwbqzsw', 'aarngiri'],
    ['photo-1582978571763-2d039e56f0c3', 'gbG65gRAGx4', 'nicolasjleclercq'],
    ['photo-1547052178-7f2c5a20c332', '-WB52caEpmI', 'naive_eye'],
    ['photo-1675319245480-215961c129f1', 'QTsrvfTHvpA', 'tariqmahmudnaim'],
  ],
  jbl: [
    ['photo-1700563133041-3d6e64235082', 'Lr4diye5bnQ', 'ivrn'],
    ['photo-1589256469067-ea99122bbdc4', 'zxvnrxl5OXc', 'habibdadkhah'],
    ['photo-1589001181560-a8df1800e501', '6HDoRL0Y_-w', 'habibdadkhah'],
    ['photo-1659262795083-a48fd082c5e7', 'M6qISKT0AKk', 'martin_s23'],
    ['photo-1612552441157-a0efa6d4f15c', 'AqG1X0AObm0', 'aamir_in'],
    ['photo-1605957072929-4fd939a05e24', '3vd7GV2clzo', 'aronpw'],
    ['photo-1589003077984-894e133dabab', 'S0B-pmGjdVA', 'habibdadkhah'],
    ['photo-1687363251769-560d957b8847', 'Orp7DHJpfZs', 'dxstub'],
    ['photo-1588131153911-a4ea5189fe19', 'eMw1fBx4_Wk', 'designedbyflores'],
  ],
  marshall: [
    ['photo-1699567362704-81cf1f7eed94', '6ZF15OgX-zI', 'brandee35'],
    ['photo-1699567362635-c38902d38c6d', '3t2W17TGzVs', 'brandee35'],
    ['photo-1699567364063-6e3a3768b564', 'kWs9p-FyvJc', 'brandee35'],
    ['photo-1692351014024-97edd83a7b5a', 'WJ4yjm5qBXM', 'vuatao'],
    ['photo-1600691222598-51c23d20bb05', 'l2QpAatsM9I', 'ruofeng'],
    ['photo-1699567363140-989bf83cd3f4', 'olHHupTvMsg', 'brandee35'],
    ['photo-1546518449-3826f84350e9', 'xGAG-yRP2PQ', 'ryanwaring'],
    ['photo-1502798985865-1ab60332f46c', 'jhd_t44LUeg', 'nofilter_noglory'],
    ['photo-1692651763027-72aeb12130d7', 'QvlDNihR3Qw', 'vitalymazur'],
  ],
  homespeaker: [
    ['photo-1594419015530-4676f41c4bb9', 'HeP8bGoLx-U', 'galex'],
    ['photo-1561558834-3b6b2aa22b6a', 'SIhZLsmNxkA', 'magnusjonasson'],
    ['photo-1548617335-c1b176388c65', '2FcSIYJQkTM', 'nicolaslafargue'],
    ['photo-1737948233286-7e2c95432091', '8uWs2-PE4ZE', 'shiienurm'],
    ['photo-1591452706295-06d0d6abc3aa', 'XbUi8BP_GQQ', 'emildiallo'],
  ],
  applewatch: [
    ['photo-1579586337278-3befd40fd17a', '2wFoa040m8g', 'sdaoudi'],
    ['photo-1546868871-7041f2a55e12', 'hbTKIbuMmBI', 'danielkorpai'],
    ['photo-1624096104992-9b4fa3a279dd', 'O43D6CYzxqM', 'obuol'],
    ['photo-1551816230-ef5deaed4a26', 'QhF3YGsDrYk', 'danielkorpai'],
    ['photo-1637160151663-a410315e4e75', 'IGO10LkxP_g', 'klim11'],
    ['photo-1617043983671-adaadcaa2460', 'KjsRBYfj9hA', 'infinostudio'],
    ['photo-1508685096489-7aacd43bd3b1', '0vsk2_9dkqo', 'lloyddirks'],
    ['photo-1434493789847-2f02dc6ca35d', 'vCF5sB7QecM', 'lukechesser'],
    ['photo-1609096458733-95b38583ac4e', '3_PaUEEcwMc', 'andrewmcelroy'],
  ],
  smartwatch: [
    ['photo-1632794716789-42d9995fb5b6', 'jRM_bQIb_80', 'alaminip'],
    ['photo-1691439378545-dd6b35ff2f7b', 'N2SL3YWInWY', 'rodolfobarretoweb'],
    ['photo-1722153105551-cfea928e80de', 'COvwQWG2XMc', 'rmrdnl'],
    ['photo-1676554565987-524692127b1a', 'CAeegpdI3pY', 'zelebb'],
    ['photo-1676315636794-04c032cff6a9', '2CWmoEyznZg', 'zelebb'],
    ['photo-1683714152903-a17197c2347c', '28fl492HCZc', 'alaminip'],
    ['photo-1694747660463-2d5ab46625d1', 'xmslxI6UsiA', 'amanz'],
    ['photo-1780592675896-ac3296d4e013', 'uCdXMAnCvRo', 'nishatsamadzai2001'],
    ['photo-1787834964347-33cf5c999ca6', 'Ca9ZFS2tl5U', 'glyamin'],
    ['photo-1523275335684-37898b6baf30', '2cFZ_FB08UM', 'rachitank'],
    ['photo-1706289835536-3aa7b81aa2fd', '3WtlDwk8nhA', 'zelebb'],
    ['photo-1774354803874-5df09f35aada', '-DwwhdgrnXs', 'phuocsangvn'],
  ],
  garmin: [
    ['photo-1656955003707-9a86ad069bb3', 'P0nP7X_r73s', 'skjev5280'],
    ['photo-1722445423163-f57f92ea9f78', 'vfAQkN3WbwU', 'maquilingskiswifty'],
    ['photo-1656955178167-3888ac44843c', 'qvVE1mKRjZI', 'skjev5280'],
    ['photo-1728281189472-7070f13b0b29', 'Z514VVzLYDM', 'dbr0vskyi'],
    ['photo-1750776104271-4f61303e9eeb', 'zmGbl59Mq4U', 'alex_skobe'],
    ['photo-1669149539822-91cf22b1e205', 'CgntmxCnXY4', 'arthurhinton'],
    ['photo-1750776100861-30c172651817', '6FrQw4QidQA', 'alex_skobe'],
    ['photo-1778305595929-38bb37c0c8f6', '-_QzAf4_fJ8', 'joshsm1th'],
    ['photo-1773399452188-a42e29543bf2', '_UZVVThG_u0', 'streetsh'],
    ['photo-1691921673576-07c6032e6306', 'YbgLm_O7mGQ', 'arthurhinton'],
  ],
  fitband: [
    ['photo-1575311373937-040b8e1fd5b6', 'KiAYZZjpjkQ', 'mycreate'],
    ['photo-1589749646354-ccc9152b572b', 'aXxESZ0jGHA', 'flaviotx'],
    ['photo-1557935728-e6d1eaabe558', 'q8Emkm9ooig', 'fitnish'],
    ['photo-1503328427499-d92d1ac3d174', 'QRWAdBCqysc', 'abrkett'],
    ['photo-1705777299734-00fb234ca7b5', 'QG9oOSymp4M', 'lmahammad'],
    ['photo-1626194062394-022cc80f6d2d', 'Jyf6yBJpGis', 'lenzil'],
    ['photo-1629339837617-7069ce9e7f6b', '0jIxHsotdac', 'debagni'],
    ['photo-1576243345690-4e4b79b63288', '5--lSW0MiE0', 'chilinik'],
  ],
  ps5: [
    ['photo-1622297845775-5ff3fef71d13', 'ads33nL7V4k', 'helloimnik'],
    ['photo-1731405858377-6de0070d8d65', 'uY6ZORCOCAM', 'amanz'],
    ['photo-1605296830714-7c02e14957ac', 'cL7xovIO7sw', 'cortes'],
    ['photo-1617864064479-f203fc7897c0', 'tnfbre82_hc', '1hundredimages'],
    ['photo-1731405849985-8e5478dddc5e', 'IAAxRtlmD9w', 'amanz'],
    ['photo-1752262526779-bd65a9b83c25', 'mth7yBmBQ84', 'user_pascal'],
    ['photo-1731405832370-f7a9bf0f2bba', 'WlxBHSKW7dU', 'amanz'],
    ['photo-1679813553141-5621567f95e8', 'TlzsP6OLNYo', 'mahdinaseri'],
    ['photo-1606813907291-d86efa9b94db', 'QHha7JOJYnw', '1charlessims'],
  ],
  dualsense: [
    ['photo-1635048424329-a9bfb146d7aa', 'DYDIF2OuavM', 'triyansh'],
    ['photo-1644571580646-7048372c491a', 'K_QbvoNqRvo', '8bitspell'],
    ['photo-1664092815415-e1e26aff03aa', 'sucrF2leEm0', 'usualmorals'],
    ['photo-1664092815283-19c6196f5319', 'wjER4Ywen0M', 'usualmorals'],
    ['photo-1610119260051-a8d0b3a57e5e', 'K9SckAufIg8', 'snik3rs'],
    ['photo-1606144042614-b2417e99c4e3', 'NVD_32BBZFE', 'kseverin'],
  ],
  xboxs: [
    ['photo-1683823362932-6f7599661d22', 'GNQKL0cLv6I', 'martz90'],
    ['photo-1700153498368-3f61e094063e', 'LdD11HrJchc', 'inspiredimages'],
    ['photo-1683823363200-5857de737eb5', 'VZvkaTF6_wQ', 'martz90'],
  ],
  xboxpad: [
    ['photo-1612801799890-4ba4760b6590', 'HADjLtjoe2E', 'kommumikation'],
    ['photo-1604586376807-f73185cf5867', 'SuPAbuuK7f4', '8bitspell'],
    ['photo-1632312527375-bd5d5a0d3484', 'Y56xXBtlL0k', 'jerrografie'],
    ['photo-1631896928983-2c94ea6f97e8', 'ldJXWA1Ty3c', 'guiom_c'],
    ['photo-1580464360012-948b4fe5ddc2', 'euuTqMAagsY', 'mattttt'],
    ['photo-1543973277-5020ef836640', 'F4SxJ7ZtiRM', 'sebastiandc'],
    ['photo-1708235094342-2c550599223f', '8rVDQsOajWM', 'tsvillain'],
    ['photo-1700155007323-1e4f4e58d627', 'A2wLtPGTWKA', 'inspiredimages'],
  ],
  xbox: [
    ['photo-1621259182978-fbf93132d53d', 'DPOdCl4bGJU', 'billyfreeman'],
    ['photo-1693456281728-8f7b29d85303', 'denH8Pyv08M', 'qwerzl'],
    ['photo-1621259182181-1ccb9ec306cd', 'Zjn4dT993-g', 'billyfreeman'],
    ['photo-1621259181233-aa03cf592ea7', '3XMP10gBuMw', 'billyfreeman'],
    ['photo-1621259183495-6791fd319088', '5O5oJGOnj20', 'billyfreeman'],
  ],
  switch: [
    ['photo-1585427795543-33cf23ea2853', 'NOBH7Rq7ZN8', 'alvarordesign'],
    ['photo-1578303512597-81e6cc155b3e', 'PU1uYnZrAL0', 'yasin'],
    ['photo-1615680022647-99c397cbcaea', 'JHKrEcjXSi8', 'introspectivedsgn'],
    ['photo-1632256347173-298f7407d1df', '4riXT55pODk', 'cyberdanny'],
    ['photo-1585857188823-77658a70979a', 'tn7v-55TI4Q', 'stereophototyp'],
    ['photo-1591182136289-67ff16828fd4', 'UuLX0r-gKJI', 'lykz'],
    ['photo-1615680022648-2db11101c73a', 'fP_-UlTjs1M', 'introspectivedsgn'],
    ['photo-1550921464-9f7a27f99edc', 'zsXvRKtsf6Q', 'enriquisimotv'],
    ['photo-1585857188900-86a7c2c5f811', 'KjhWyo08guA', 'stereophototyp'],
    ['photo-1749531086082-47444e5174a9', 'W67FtHO1v4s', 'kaprion'],
    ['photo-1680007966627-d49ae18dbbae', 'xNUXE7iUBo8', 'chamavito'],
    ['photo-1585857188849-f44983e4a509', 'jqpRECmiNEU', 'stereophototyp'],
  ],
  steamdeck: [
    ['photo-1656662962127-d8344d924d74', '1YdquFKt7NU', 'edgaralmeida'],
    ['photo-1656662961786-b04873ceb4b9', 'ODDeVEZGEfs', 'edgaralmeida'],
    ['photo-1653757416630-bd262a193996', 'qgyAjUAtDW4', 'empedokle'],
    ['photo-1653757449444-4a608b0b6c77', '5dTYQRIhwug', 'empedokle'],
    ['photo-1654621158365-55fcf7b76fb7', 'zmqes6OO7R4', 'empedokle'],
    ['photo-1653757398818-5016ba6d2594', 'pE_rw8cMkrY', 'empedokle'],
    ['photo-1653757456805-a36fbab678d5', 'kHfLGV82Ylk', 'empedokle'],
    ['photo-1654621198651-fe1baffcef76', '17_c7mc_6_k', 'empedokle'],
  ],
  mousew: [
    ['photo-1755373255602-c030aac3bc69', 'TfxQ1k9Ecpw', 'zelebb'],
    ['photo-1752442534054-ef5b221c39a3', 'fG5Z_OUXB4E', 'zelebb'],
    ['photo-1527814050087-3793815479db', 'VghbBAYqUJ0', 'v3frankie'],
    ['photo-1527864550417-7fd91fc51a46', 'ZtxED1cpB1E', 'oscaresquivel'],
  ],
  mouse: [
    ['photo-1615663245857-ac93bb7c39e7', '4PchFKrUw84', 'toastyraw'],
    ['photo-1658070429465-848c0796abf3', 'Q-jxVqz0wVQ', 'thekidph'],
    ['photo-1677019758488-ca44c974ef62', 'TAsJIiyS_nM', 'zelebb'],
    ['photo-1625750188088-f6cd6756349c', 'wBGV52CGY5w', 'obuol'],
    ['photo-1613141411244-0e4ac259d217', 'fG4BTSKPo3w', 'maargaming'],
    ['photo-1707592691247-5c3a1c7ba0e3', 'O5CZSXxT8NE', 'barryalbert24'],
    ['photo-1733151535078-e2c8cf1ae18f', 'Tqynr9ahdX0', 'juairiaa'],
    ['photo-1760376789492-de70fab19d94', 'RD14O46zCac', 'barryalbert24'],
  ],
  rgbkb: [
    ['photo-1538481199705-c710c4e965fc', 'nCU4yq5xDEQ', 'mateovrb'],
    ['photo-1626958390943-a70309376444', 'sfKigQv7viY', 'michelleding'],
    ['photo-1547394765-185e1e68f34e', 'WkfDrhxDMC8', 'christianw'],
    ['photo-1612198188060-c7c2a3b66eae', 'dbgbyzFR8uI', 'kath_a'],
  ],
  mechkb: [
    ['photo-1618384887929-16ec33fab9ef', 'KYw1eUx1J7Y', 'stefentan'],
    ['photo-1589578228447-e1a4e481c6c8', 'cVUPic1cbd4', 'martingarrido'],
    ['photo-1632079003110-d694908500da', '4GzqVNX0TCQ', 'thekidph'],
    ['photo-1636858507939-acc6b17bda52', 'yLTVhSSoAx4', 'thekidph'],
    ['photo-1635987391914-cb84b567e68f', 'p5rgceFiOH0', 'thekidph'],
    ['photo-1555532538-dcdbd01d373d', '1osIUArK5oA', 'floriankrumm'],
    ['photo-1595044426077-d36d9236d54a', 'ZByWaPXD2fU', 'jay_zhang'],
    ['photo-1602025882379-e01cf08baa51', 'aXY5doQNZTc', 'dsebas'],
    ['photo-1625130694338-4110ba634e59', 'c4a_0kycTUE', 'bryannatanael'],
    ['photo-1664813398575-819b46e5ab8d', 'O7wNAVxmgA4', 'phaelnogueira'],
  ],
  applekb: [
    ['photo-1608377205849-29e866f59df4', 'BUhkqOLoWAE', 'moritz_photography'],
    ['photo-1625645153391-ae69c0b090cf', 'iJoOpa05d0c', 'teddygr'],
    ['photo-1608377205627-ae97b46989f4', 'fz3QNuVfecU', 'moritz_photography'],
    ['photo-1608377205700-249f4b48b180', 'xb0lxn8hEEE', 'moritz_photography'],
    ['photo-1493878777218-cf22a808450c', '1RVWGnPR2i4', 'lensinkmitchel'],
    ['photo-1587829741301-dc798b83add3', 'PXaQXThG1FY', 'claybanks'],
    ['photo-1572916118970-fb5c8a1cb3d1', 'FNhyekndnSM', 'wesleyphotography'],
  ],
  streamdeck: [
    ['photo-1705290640944-16e5ee669c2b', 'OkzfCHBVTH8', 'chrishardyphotography'],
    ['photo-1671063137261-f56fcc16dd2c', '8eug8uUbpPY', 'jbccreative'],
    ['photo-1715448800981-e3fd4666d34a', 'LcQ9DD8BBO8', 'mikafromdenmark'],
  ],
  vr: [
    ['photo-1622979135225-d2ba269cf1ac', 'Zf0mPf4lG-U', 'gieling'],
    ['photo-1617802690992-15d93263d3a9', 'MvJezf8FT4o', 'viniciusamano'],
    ['photo-1657734240326-8f2ab858a2dd', 'fFeXD0EWY-Q', 'mediamodifier'],
    ['photo-1657734240343-44afa9402985', 'xBRtGqIjRG8', 'mediamodifier'],
    ['photo-1683821291789-c374b55e0cd2', 'UzQCWiN3HHc', 'liamcharmer'],
    ['photo-1576633587382-13ddf37b1fc1', 'DeyfdybVQhA', 'thepaintedsquarejessica'],
    ['photo-1605647540924-852290f6b0d5', '8vn4KvfU640', 'nampoh'],
  ],
  powerbank: [
    ['photo-1706275399494-fb26bbc5da63', 'CY4mVpRvPxc', 'gomi_design'],
    ['photo-1736516434209-51ece1006788', '8q8icoKEJIY', 'kosti_2'],
    ['photo-1706275399524-813e89914e43', 'KI7M3RQezJI', 'gomi_design'],
    ['photo-1586253634019-c77872f966f0', 'JHEIAnOXbkc', 'markuswinkler'],
    ['photo-1596207891316-23851be3cc20', 'vYxnwamt6HE', 'ziontech'],
    ['photo-1614399113305-a127bb2ca893', 'fhv8SNVP7XE', 'athharv'],
    ['photo-1644571669391-c0b48363abed', 'rMsGEodX9bg', '8bitspell'],
    ['photo-1594843665794-446ce915d840', 'QsVafcI4ouo', 'saivarma2000'],
  ],
  charger: [
    ['photo-1731616103600-3fe7ccdc5a59', 'f0EpYkZ-cp4', 'zelebb'],
    ['photo-1725304382197-663ae3864750', '1A_MMH9w-Sc', 'zelebb'],
    ['photo-1583863788434-e58a36330cf0', '6l5z2EPrnFc', 'homemademedia'],
    ['photo-1586254116648-d33e0fada133', 'tzfD-clzUTU', 'markuswinkler'],
    ['photo-1586254116951-5263e2cdb44c', '9QTFMkh-ezM', 'markuswinkler'],
    ['photo-1520287636485-66d0e25add79', 'G_GaeDNyMe8', 'rebapocket'],
    ['photo-1517320069935-381614f8c1e5', 'ZUabNmumOcA', 'steve_j'],
  ],
  ssd: [
    ['photo-1577538926210-fc6cc624fde2', 'W4GR5u0M2JQ', 'purzlbaum'],
    ['photo-1721333084639-0f64b0583875', 'OB3rrAhiqM0', 'samsungmemory'],
    ['photo-1659540190941-66606ec13ca6', 'KPlqNM3QJSQ', 'samsungmemory'],
    ['photo-1720048170016-751876b1dba0', 'KMjNCxg1iRo', 'samsungmemory'],
    ['photo-1624895608078-e9f564cbe3fa', 'xEK3FiK6H3o', 'siyuan_hu'],
    ['photo-1610415394675-22121ca0de23', 'Quw63kTYfGY', 'samsungmemory'],
    ['photo-1659543038895-4c873e8b9a55', 'jNa0jEBawXU', 'samsungmemory'],
    ['photo-1721333084686-e13de2ef7247', 'te__kNzBkkw', 'samsungmemory'],
  ],
  wireless: [
    ['photo-1681382659831-2f3b16748a64', 'jVlH4WpOFo4', 'neerajbhateja'],
    ['photo-1617975426095-f073792aef15', 'S8xWhJFidWQ', 'nublson'],
    ['photo-1591290619618-904f6dd935e3', 'iE-MsY-8vEw', 'peotus'],
    ['photo-1603674554159-b62f6febbce5', 'MVin7poIsoM', 'jamesyarema'],
    ['photo-1543472750-506bacbf5808', 'r0Do56ntkBs', 'wuwulife'],
    ['photo-1617975316514-69cd7e16c2a4', 'qAAVmtEurcs', 'nublson'],
    ['photo-1633381638729-27f730955c23', '1Y579--3k5M', 'webtechsmart'],
    ['photo-1737882171913-f4ced0ce73d8', '81vuPDvvLng', 'yasin'],
  ],
  monitor: [
    ['photo-1587831990711-23ca6441447b', 'x2Z0uNj-Quo', 'abeso'],
    ['photo-1575318634028-6a0cfcb60c59', 'TlRQin0iwjE', 'maxandrey'],
    ['photo-1570485071395-29b575ea3b4e', 'KZnfwqi-B0U', 'romiem'],
    ['photo-1614624533048-a9c2f9cb5a96', '01hQvBUC7rI', 'linusmimietz'],
    ['photo-1561754825-6f9d7b82322d', '_cX76xaZB5A', 'sidem0n'],
    ['photo-1616763355548-1b606f439f86', 'LAY19dUD_ro', 'mertceyhan'],
    ['photo-1495954222046-2c427ecb546d', '3mWxKnqET3E', 'reddfrancisco'],
    ['photo-1547658718-1cdaa0852790', '8GDCzWrcE3M', 'danielkorpai'],
    ['photo-1483058712412-4245e9b90334', 'KE0nC8-58MQ', 'carlheyerdahl'],
    ['photo-1510519138101-570d1dca3d66', 'OVbeSXRk_9E', 'nkachanovskyyy'],
    ['photo-1575318633968-0383e7d07ca0', '-8-2YWKt8Ag', 'maxandrey'],
  ],
  lightbar: [
    ['photo-1718587712065-c06c858897d8', 'eM8kSl3uTUU', 'nathadej'],
    ['photo-1647790292957-c7f3b44b3973', 'vDTIPOi8cek', 'fazurrehman'],
    ['photo-1674083324755-94b34240ac99', 'iAk1pdNP0vw', 'ejaquino'],
    ['photo-1674083401439-e358eda52589', 'Eou-wH26X8Y', 'ejaquino'],
    ['photo-1726186029199-218e58c9fb41', 'uo7UYGyxcaQ', 'fazurrehman'],
  ],
  trackpad: [
    ['photo-1608421334558-2414ca992e79', 'tv8BEEKDxGY', 'egorghetto'],
    ['photo-1732310964074-2d425d1f8e78', '1J1zA1qTuDs', 'sammysays___'],
    ['photo-1608377205627-ae97b46989f4', 'fz3QNuVfecU', 'moritz_photography'],
  ],
  raspberry: [
    ['photo-1629739884942-8678d138dd64', 'VHTVtYTNr8M', 'praveentcom'],
    ['photo-1629739884912-92f6255f1920', 'Pkn_rlsBmzo', 'praveentcom'],
    ['photo-1610812387871-806d3db9f5aa', 'rZKdS0wI8Ks', 'vishnumaiea'],
    ['photo-1631553126875-88a6f19b90c2', 'BIHgNEaM394', 'jainath'],
    ['photo-1610812388300-cd1e9cf28b54', 'eaDwf4UAEhk', 'vishnumaiea'],
    ['photo-1631553127988-36343ac5bb0c', 'jvHymbpto1E', 'jainath'],
  ],
  router: [
    ['photo-1621685634155-dcb444e2ec98', 'U52NDoOl6gg', 'maik_wi'],
    ['photo-1494173962596-0ff16c1b6a81', 'qPojqUji_y4', 'gbeaudry'],
    ['photo-1525004351186-bdc426f3efaa', 'iU8fDX7xnzM', 'andresurena'],
    ['photo-1658154476020-61778eb53b29', '3l9lH2GtgBU', 'joeyabanks'],
  ],
  webcam: [
    ['photo-1623949556303-b0d17d198863', 'lq87UxGSiEQ', 'emilianocicero'],
    ['photo-1614588876378-b2ffa4520c22', 'VAoSKP_ocN0', 'waldemarbrandt67w'],
    ['photo-1622750342107-4b60e2704157', 'cJGDRjl0TEs', 'namzo'],
    ['photo-1636569826709-8e07f6104992', '9vP2tWTwsF4', 'paus_d_'],
    ['photo-1629429407756-446d66f5b24e', 'VIdQW-1-fI4', 'rebekahyip'],
    ['photo-1641853256367-e287771c4e97', 'd7q4P4CRC3Q', 'gabrieluizramos'],
  ],
  mic: [
    ['photo-1583593711082-aaa381feb2f1', 'kuDzh5rufkk', 'chrisyangchrisfilm'],
    ['photo-1585692352038-83025e0333bf', '_KPPOep6QoI', 'ymoran'],
    ['photo-1613212946588-e21bb2a9fa38', 'zIPtyM79pIs', 'javiestebaan'],
    ['photo-1583665606514-e0f81cc5cded', 'Z_7wVf_JgS0', 'chrisyangchrisfilm'],
    ['photo-1554200876-907f9286c2a1', 'UUPpu2sYV6E', 'cowomen'],
  ],
  dock: [
    ['photo-1616578273577-5d54546f4dec', 'QirgO8svCBI', 'maybejensen'],
    ['photo-1616578273461-3a99ce422de6', '4nVJUZEJb3s', 'maybejensen'],
    ['photo-1760462788271-2909bf082437', '_mAtSWXoXcc', 'matgocman'],
    ['photo-1616578781650-cd818fa41e57', 'lCq0Tfl9-nI', 'maybejensen'],
  ],
};

/** Which pool a product draws from — by shape first, then brand/title. */
export function poolFor({ shape, brand, title, colorway }) {
  const b = brand.toLowerCase();
  const t = title.toLowerCase();
  switch (shape) {
    case 'laptop':
      return b === 'apple' ? 'macbook' : 'winlaptop';
    case 'laptop-gaming':
      return 'gaming';
    case 'laptop-convertible':
      return 'convertible';
    case 'phone':
    case 'phone-island':
      if (b === 'apple') return 'iphone';
      if (b === 'samsung') return 'samsung';
      if (b === 'google') return 'pixel';
      return 'android';
    case 'headphones':
      return t.includes('airpods max') ? 'airpodsmax' : 'overear';
    case 'earbuds':
      return b === 'apple' ? 'airpods' : 'earbuds';
    case 'speaker':
    case 'speaker-brick':
      if (b === 'jbl') return 'jbl';
      if (b === 'marshall') return 'marshall';
      if (b === 'sonos') return 'homespeaker';
      return 'speaker';
    case 'watch':
    case 'watch-round':
      if (b === 'apple') return 'applewatch';
      if (b === 'garmin') return 'garmin';
      return 'smartwatch';
    case 'fitness-band':
      return 'fitband';
    case 'console':
      return 'ps5';
    case 'console-box':
      return t.includes('series s') ? 'xboxs' : 'xbox';
    case 'controller':
      return b === 'sony' ? 'dualsense' : 'xboxpad';
    case 'handheld':
      if (b === 'nintendo') return 'switch';
      if (b === 'sony') return 'dualsense';
      return 'steamdeck';
    case 'mouse':
      return colorway === 'porcelain' ? 'mousew' : 'mouse';
    case 'keyboard':
      if (b === 'apple') return 'applekb';
      if (b === 'razer') return 'rgbkb';
      return 'mechkb';
    case 'keyboard-compact':
      return b === 'elgato' ? 'streamdeck' : 'mechkb';
    case 'vr-headset':
      return 'vr';
    case 'powerbank':
      return 'powerbank';
    case 'charger':
      return 'charger';
    case 'drive':
      return 'ssd';
    case 'charge-pad':
      return 'wireless';
    case 'monitor':
      return 'monitor';
    case 'light-bar':
      return 'lightbar';
    case 'trackpad':
      return 'trackpad';
    case 'board':
      return b === 'raspberry pi' ? 'raspberry' : 'dock';
    case 'router':
      return 'router';
    case 'webcam':
      return 'webcam';
    case 'microphone':
      return 'mic';
    default:
      return null;
  }
}

const CDN = 'https://images.unsplash.com';

/** A square, cropped, CDN-resized URL for one photo. */
export const photoUrl = (slug, size = 1000) =>
  `${CDN}/${slug}?auto=format&fit=crop&w=${size}&h=${size}&q=80`;

/**
 * Assigns photos across a catalogue so products sharing a pool get different
 * lead images: the n-th product in a pool starts at photo n and takes the next
 * two as its extra views. Returns Map(title → [url, url, url]).
 */
export function assignPhotos(rows) {
  const seen = {};
  const out = new Map();
  for (const row of rows) {
    const key = poolFor(row);
    const pool = key && PHOTO_POOLS[key];
    if (!pool?.length) continue;
    const start = (seen[key] = (seen[key] ?? -1) + 1);
    const count = Math.min(3, pool.length);
    const urls = [];
    for (let i = 0; i < count; i += 1) urls.push(photoUrl(pool[(start + i) % pool.length][0]));
    out.set(row.title, urls);
  }
  return out;
}

/** slug → { id, username } for crediting photographers. */
export const PHOTO_CREDITS = Object.fromEntries(
  Object.values(PHOTO_POOLS)
    .flat()
    .map(([slug, id, username]) => [slug, { id, username, url: `https://unsplash.com/photos/${id}` }])
);
