# Changelog

## [0.0.4](https://github.com/dedalus-labs/hollywood/compare/v0.0.3...v0.0.4) (2026-08-21)


### Features

* **expressions:** expose stacked pull request context ([#39](https://github.com/dedalus-labs/hollywood/issues/39)) ([cb0d8f7](https://github.com/dedalus-labs/hollywood/commit/cb0d8f706eff22525a4cc2b2b29ee4289b73ce22))
* **workflows:** type merge groups ([#37](https://github.com/dedalus-labs/hollywood/issues/37)) ([a6b5fdc](https://github.com/dedalus-labs/hollywood/commit/a6b5fdcfba8188fc7e2b34f1b4d7e13115ede6f6))


### Bug Fixes

* **release:** create immutable tags explicitly ([ec43662](https://github.com/dedalus-labs/hollywood/commit/ec436623d5b759ebf8e4f5f9f8dafd49f954a3c2))
* **release:** publish immutable component drafts ([#76](https://github.com/dedalus-labs/hollywood/issues/76)) ([5b1dc5b](https://github.com/dedalus-labs/hollywood/commit/5b1dc5b8e939868e2bd85cc8dac6a4df8dfe9df0))
* **release:** require approved sequential publication ([#80](https://github.com/dedalus-labs/hollywood/issues/80)) ([70780cd](https://github.com/dedalus-labs/hollywood/commit/70780cd421a2911761d922638f403510838929fd))
* **release:** resolve immutable drafts by list ([#77](https://github.com/dedalus-labs/hollywood/issues/77)) ([c319161](https://github.com/dedalus-labs/hollywood/commit/c319161a05bb3991240f01770349beb93f0ae156))


### Chores

* **deps-dev:** bump @types/node from 24.13.2 to 26.2.0 ([#87](https://github.com/dedalus-labs/hollywood/issues/87)) ([9b2a7d9](https://github.com/dedalus-labs/hollywood/commit/9b2a7d950dafa2fbac805b82bdf5591f2f5d58a7))
* **deps-dev:** bump commander from 14.0.3 to 15.0.0 ([#86](https://github.com/dedalus-labs/hollywood/issues/86)) ([bb20e8c](https://github.com/dedalus-labs/hollywood/commit/bb20e8cfcc2258030e37ba9741db28c30ea3c13c))
* **deps-dev:** bump commander packages to 15.0.0 ([bb20e8c](https://github.com/dedalus-labs/hollywood/commit/bb20e8cfcc2258030e37ba9741db28c30ea3c13c))
* **deps-dev:** bump oxlint from 1.70.0 to 1.78.0 ([#68](https://github.com/dedalus-labs/hollywood/issues/68)) ([c265703](https://github.com/dedalus-labs/hollywood/commit/c2657039164582def4513f9f9e43814a88e00a59))
* **deps-dev:** bump oxlint-tsgolint from 0.22.1 to 7.0.2001 ([#66](https://github.com/dedalus-labs/hollywood/issues/66)) ([56ba05c](https://github.com/dedalus-labs/hollywood/commit/56ba05c66a34e8cd77281d9369a053e39f958448))
* **deps-dev:** bump typescript from 6.0.3 to 7.0.2 ([#67](https://github.com/dedalus-labs/hollywood/issues/67)) ([c0f092c](https://github.com/dedalus-labs/hollywood/commit/c0f092c2e755dfc39c2d340486e16e7a80c3b02f))
* **deps-dev:** bump vitest from 4.1.9 to 4.1.11 ([#88](https://github.com/dedalus-labs/hollywood/issues/88)) ([eebafa9](https://github.com/dedalus-labs/hollywood/commit/eebafa9bac66df50cd6661b9fc133db4c79ed2e5))
* **deps:** bump actions/checkout from 6.0.3 to 7.0.1 ([#62](https://github.com/dedalus-labs/hollywood/issues/62)) ([b7bbd14](https://github.com/dedalus-labs/hollywood/commit/b7bbd1495e02997049f87d9f82ec18d01afac636))
* **deps:** bump actions/setup-python from 6.2.0 to 7.0.0 ([#84](https://github.com/dedalus-labs/hollywood/issues/84)) ([f808e7d](https://github.com/dedalus-labs/hollywood/commit/f808e7d99dd4944368eac48f5e87d2b489adb497))
* **deps:** bump docker/login-action from 3.7.0 to 4.6.0 ([#83](https://github.com/dedalus-labs/hollywood/issues/83)) ([3ca94f7](https://github.com/dedalus-labs/hollywood/commit/3ca94f7f775824b5d2de2d177706409c8c04f419))
* **deps:** bump docker/setup-qemu-action from 3.7.0 to 4.2.0 ([#85](https://github.com/dedalus-labs/hollywood/issues/85)) ([80f5a79](https://github.com/dedalus-labs/hollywood/commit/80f5a791b752c8c967c7675fafc8e0410dc724af))
* **repo:** untrack build output ([#34](https://github.com/dedalus-labs/hollywood/issues/34)) ([0e93ba1](https://github.com/dedalus-labs/hollywood/commit/0e93ba1068b044acf9632e6de1f60208e9e71019))


### Documentation

* remove unused motto styles ([#38](https://github.com/dedalus-labs/hollywood/issues/38)) ([37ede53](https://github.com/dedalus-labs/hollywood/commit/37ede53accdb06c41114e4f4bc4c9cdac09c005f))


### Refactors

* **types:** make workflow triggers exact ([#41](https://github.com/dedalus-labs/hollywood/issues/41)) ([50b27b7](https://github.com/dedalus-labs/hollywood/commit/50b27b7f2e57ffbe852afca3e1bc2adedc2763b7))

## [0.0.3](https://github.com/dedalus-labs/hollywood/compare/v0.0.2...v0.0.3) (2026-08-14)


### Features

* **ci:** publish verified runner images ([691226c](https://github.com/dedalus-labs/hollywood/commit/691226c9e63bfe6d70eec223e1f52e681e2e68cf))
* **cli:** inspect runner environments ([1e5f758](https://github.com/dedalus-labs/hollywood/commit/1e5f75808efb40c335b7837db51d9107a2ec3dd7))
* **release:** version runner images independently ([d8e8858](https://github.com/dedalus-labs/hollywood/commit/d8e8858c511edff877104fc4884d6229b02f8597))
* **runner:** capture sanitized host state ([0fc5346](https://github.com/dedalus-labs/hollywood/commit/0fc5346991ee509140fc096763deb7c4eb008dfd))
* **runner:** define the portable runner image ([ac6e109](https://github.com/dedalus-labs/hollywood/commit/ac6e109dbdaebf96d5a880895ab8c7c8ed3167fa))
* **runner:** define typed environment contracts ([ec1242a](https://github.com/dedalus-labs/hollywood/commit/ec1242a2a7d8b51e0373cc9f587003905b0a80ec))
* **runner:** execute GitHub jobs with JIT runners ([#61](https://github.com/dedalus-labs/hollywood/issues/61)) ([0922bea](https://github.com/dedalus-labs/hollywood/commit/0922bea1ca3f4b1e67d93771696a5398cd537e02))
* **runtime:** add explicit container providers ([f69b85d](https://github.com/dedalus-labs/hollywood/commit/f69b85d606ab20df8f6f04332105b14ed1ca047c))
* **runtime:** run actions in containers ([504ec0d](https://github.com/dedalus-labs/hollywood/commit/504ec0ddc80bb73f144685d3b4b4aa6f1d862dc9))
* **workflow:** structure run commands ([#70](https://github.com/dedalus-labs/hollywood/issues/70)) ([9baa463](https://github.com/dedalus-labs/hollywood/commit/9baa46312f71cba662865565e41890f270ab872d))


### Bug Fixes

* **ci:** make required checks queue-ready ([#59](https://github.com/dedalus-labs/hollywood/issues/59)) ([50656a1](https://github.com/dedalus-labs/hollywood/commit/50656a13f3212e855596896cf3ad771dff3e9a48))
* **release:** recover failed npm publishes ([#58](https://github.com/dedalus-labs/hollywood/issues/58)) ([20a17ea](https://github.com/dedalus-labs/hollywood/commit/20a17ea3efdba2d4a75b6867300eafb342aed6e4))
* **test:** use short unix socket paths ([90770b5](https://github.com/dedalus-labs/hollywood/commit/90770b5d43cb16a5050c9bd3a8a7d8c4ace1c57e))


### Chores

* **security:** harden dependency installation ([3dbd9c3](https://github.com/dedalus-labs/hollywood/commit/3dbd9c398b3537f3d93f05e63c5c34c09ede9cae))


### Documentation

* **runner:** document image fidelity ([204eaf3](https://github.com/dedalus-labs/hollywood/commit/204eaf34f06f47d7c6be1272172b02f5e17a77c8))

## [0.0.2](https://github.com/dedalus-labs/hollywood/compare/v0.0.1...v0.0.2) (2026-08-12)


### Features

* **workflows:** support explicit filenames ([#55](https://github.com/dedalus-labs/hollywood/issues/55)) ([5e3302f](https://github.com/dedalus-labs/hollywood/commit/5e3302f4ea4403220dc701dbc1f79d47bcc753eb))


### Bug Fixes

* **contributors:** fail closed on trust state ([#52](https://github.com/dedalus-labs/hollywood/issues/52)) ([7ae837a](https://github.com/dedalus-labs/hollywood/commit/7ae837ad1866edb9e14735f55523744767f17534))
* **github:** render summary headings as html ([#33](https://github.com/dedalus-labs/hollywood/issues/33)) ([82d5e7a](https://github.com/dedalus-labs/hollywood/commit/82d5e7a740341b38e059c7cf7360ab270c09a18e))
* **release:** restore atomic release lifecycle ([#35](https://github.com/dedalus-labs/hollywood/issues/35)) ([cdd673c](https://github.com/dedalus-labs/hollywood/commit/cdd673cf36831dc4f94229b6b395c164bd127d23))

## [0.0.1](https://github.com/dedalus-labs/hollywood/compare/v0.1.0-alpha.1...v0.0.1) (2026-07-22)


### Features

* **github:** add compact command reports ([#27](https://github.com/dedalus-labs/hollywood/issues/27)) ([5f2b6e0](https://github.com/dedalus-labs/hollywood/commit/5f2b6e00f241d489f7c40ad1990ff4a1ac7f7b5b))
* **github:** add log color controls ([#28](https://github.com/dedalus-labs/hollywood/issues/28)) ([08af499](https://github.com/dedalus-labs/hollywood/commit/08af499038cc00800acd3558316093ed463439af))
* **github:** group action command logs ([#18](https://github.com/dedalus-labs/hollywood/issues/18)) ([b6390c7](https://github.com/dedalus-labs/hollywood/commit/b6390c76b246028e18b0b9eece76c338a84ce546))
* **script:** add typed step summaries ([#26](https://github.com/dedalus-labs/hollywood/issues/26)) ([9af9ad5](https://github.com/dedalus-labs/hollywood/commit/9af9ad55d805917c8264cbb33520dbd278a0716a))


### Bug Fixes

* **ci:** allow cla bootstrap maintainers ([989008c](https://github.com/dedalus-labs/hollywood/commit/989008cf4ff85ac846c378b20c651916d6998d4a))
* **ci:** allow owner cla bootstrap ([f10a2a4](https://github.com/dedalus-labs/hollywood/commit/f10a2a4422b4afa95febc1a46281484441ced716))
* **ci:** bootstrap local action checks ([22214d7](https://github.com/dedalus-labs/hollywood/commit/22214d76c68a094c6432e3dcd94f26c726ca9515))
* **ci:** publish prereleases to latest before ga ([#16](https://github.com/dedalus-labs/hollywood/issues/16)) ([332dd32](https://github.com/dedalus-labs/hollywood/commit/332dd32e6d02697bb770c4c1e356ef7689d1c503))
* **cla:** split contributor checks ([356cdaa](https://github.com/dedalus-labs/hollywood/commit/356cdaa1370a86ad40f93059f0a2cfb62a1d5698))
* **cla:** trust release automation author ([19dd0cb](https://github.com/dedalus-labs/hollywood/commit/19dd0cbee9b76a96b051e593dfca5b78a8565392))
* **cli:** read version from package metadata ([e2876d4](https://github.com/dedalus-labs/hollywood/commit/e2876d4a579fa769689a395651004ce1c721373d))
* **cli:** read version from package metadata ([#10](https://github.com/dedalus-labs/hollywood/issues/10)) ([b73ace5](https://github.com/dedalus-labs/hollywood/commit/b73ace5069b6f1c46dbc5a49a5c7d25e63e73674))
* **gha:** request write pr token for flowers ([#14](https://github.com/dedalus-labs/hollywood/issues/14)) ([26e485f](https://github.com/dedalus-labs/hollywood/commit/26e485f0abaebc63e0070e42604a48dc1f03603c))
* **gha:** trust cind bot rename ([#12](https://github.com/dedalus-labs/hollywood/issues/12)) ([f2520bf](https://github.com/dedalus-labs/hollywood/commit/f2520bf3d16262b4a4249170eca45b63aa3cebde))
* **release:** avoid npm dist-tag mutation ([#21](https://github.com/dedalus-labs/hollywood/issues/21)) ([64b16f9](https://github.com/dedalus-labs/hollywood/commit/64b16f90fe9fd78a43715e360622cc6330fbf5e6))
* **release:** publish npm before tagging ([#31](https://github.com/dedalus-labs/hollywood/issues/31)) ([b94864a](https://github.com/dedalus-labs/hollywood/commit/b94864af3e75d42251fb50715fa562e7449a2ed5))
* **security:** add GitHub private vulnerability reporting ([#17](https://github.com/dedalus-labs/hollywood/issues/17)) ([e5d9c6f](https://github.com/dedalus-labs/hollywood/commit/e5d9c6f461461bdc0919c99d2376f61208d9078a))


### Chores

* **actions:** rename local action script ([b686a1d](https://github.com/dedalus-labs/hollywood/commit/b686a1d1772210349468d3d2472fcdd82ba6b686))
* add npm discovery keywords ([b89f511](https://github.com/dedalus-labs/hollywood/commit/b89f511efd9c7f51abe4c47f57eb5e1de3de92fa))
* **build:** enforce source build boundary ([8c42d45](https://github.com/dedalus-labs/hollywood/commit/8c42d4580a850818d1a9346c15ae1ca561845af6))
* **ci:** add merged pr flower workflow ([9c91677](https://github.com/dedalus-labs/hollywood/commit/9c916771e1205ebcab558e9f3b42572fe80048ef))
* **ci:** gate external pr tests ([c34c279](https://github.com/dedalus-labs/hollywood/commit/c34c279d28a1743943492bde5c1c6eb2eeab951e))
* **ci:** reduce workflow log noise ([#30](https://github.com/dedalus-labs/hollywood/issues/30)) ([a984c6b](https://github.com/dedalus-labs/hollywood/commit/a984c6bf205d89800d5a0e19d6ba4c638266bc35))
* **ci:** reject handwritten action yaml ([b7ff8b7](https://github.com/dedalus-labs/hollywood/commit/b7ff8b71ccd87e86b2b3de992cc100d4875aba95))
* **ci:** update release please action ([0ebfdcc](https://github.com/dedalus-labs/hollywood/commit/0ebfdcc37fea6b3dd27c8b911a8f0a2f10050561))
* **ci:** use cind for release please ([0f976f5](https://github.com/dedalus-labs/hollywood/commit/0f976f567dc12932a035e350e5c66781013c015e))
* **ci:** use node 24 actions ([dbd4a35](https://github.com/dedalus-labs/hollywood/commit/dbd4a358acbcb368815c6de38edb9940f32e5975))
* **cli:** add check command ([56af6cb](https://github.com/dedalus-labs/hollywood/commit/56af6cb474db04b1abf69e787194623dc55d1caa))
* **generate:** space generated headers ([d8b4d04](https://github.com/dedalus-labs/hollywood/commit/d8b4d04f645cad8adff33429b3a8c3c7fac35282))
* **gha:** rename workflow sources ([1fad45b](https://github.com/dedalus-labs/hollywood/commit/1fad45bde83137a8766173d658ca854498088a6d))
* **github:** add codeowners ([3db719e](https://github.com/dedalus-labs/hollywood/commit/3db719eb678b4ca8ac5ab20b3c48364fd0126c27))
* **github:** add community templates ([b48b630](https://github.com/dedalus-labs/hollywood/commit/b48b63045d6e0a9f2dfb543a1fa3beba1c5e4e25))
* harden public release ([a4510ab](https://github.com/dedalus-labs/hollywood/commit/a4510ab44c19937b8c5797c3ad99a2feca2a6539))
* init ([76f50e8](https://github.com/dedalus-labs/hollywood/commit/76f50e832f311c43a724f584da1d52285b0beefd))
* **npm:** use dedalus-labs scope ([47c9fad](https://github.com/dedalus-labs/hollywood/commit/47c9fad4e723fb778c7b022e3fe5cf31652cb4ca))
* prepare hollywood oss release ([13bdbb0](https://github.com/dedalus-labs/hollywood/commit/13bdbb09011ffee9c91a3ea4ae52d208e3da682c))
* **release:** add npm publishing pipeline ([623cad6](https://github.com/dedalus-labs/hollywood/commit/623cad6e2026c13d7d01dcdfa046d34b37161d6d))
* support node 20 runtime ([9b6e8ab](https://github.com/dedalus-labs/hollywood/commit/9b6e8ab453c5560d2b08bc32f00806a99d0e3e19))
* **tooling:** adopt website checks ([1ae7cb2](https://github.com/dedalus-labs/hollywood/commit/1ae7cb297066ed9d3e0712f7064c87b088b752a5))


### Documentation

* add execution backend docs ([6691ea2](https://github.com/dedalus-labs/hollywood/commit/6691ea22f92c6c23f4caa91d05045fbc51dabd4f))
* add license section ([107adf5](https://github.com/dedalus-labs/hollywood/commit/107adf5d911b67f05698c455cc000b2902f788ef))
* add license section ([#11](https://github.com/dedalus-labs/hollywood/issues/11)) ([72855a0](https://github.com/dedalus-labs/hollywood/commit/72855a053a84ecdd0e4a3d20149369eee63e0f49))
* add oss site ([a82d7d4](https://github.com/dedalus-labs/hollywood/commit/a82d7d4ae62286869a1146c8eb995951a0c1f356))
* add premiere styling ([d710626](https://github.com/dedalus-labs/hollywood/commit/d710626b98e76c72333c60c5f0553837b9d7c98c))
* add public roadmap ([7a07e7c](https://github.com/dedalus-labs/hollywood/commit/7a07e7c711c1301872893a44964f22a5051a8549))
* clarify contribution trust flow ([54296be](https://github.com/dedalus-labs/hollywood/commit/54296be7d1449d8b37a5084efaceb1c1de77b55a))
* clarify contributor pr flow ([014ab4f](https://github.com/dedalus-labs/hollywood/commit/014ab4f1172280c47b83319c19811baa418604be))
* document node requirements ([318bded](https://github.com/dedalus-labs/hollywood/commit/318bded9c2435f1186e3202753f42f1915b1f2c9))
* document release flow ([3c97e1b](https://github.com/dedalus-labs/hollywood/commit/3c97e1b2de2799693191f40ec9c643360731af05))
* emphasize typed action validation ([53f90d7](https://github.com/dedalus-labs/hollywood/commit/53f90d7e90a8b09f37e731be9a78cc81ff900342))
* explain action adapter ([26d9605](https://github.com/dedalus-labs/hollywood/commit/26d96057aa0027e98be52d082fa94ff8e126431f))
* explain hollywood binary usage ([4600471](https://github.com/dedalus-labs/hollywood/commit/460047165d410eb58f1c095abe7b9cd93bd0360b))
* explain vouch flow in readme ([d87120f](https://github.com/dedalus-labs/hollywood/commit/d87120fcb7ecfabc39a00db570bcbfd441fe1116))
* generalize public examples ([388c695](https://github.com/dedalus-labs/hollywood/commit/388c6956bd5b5a8ba9ff21b81428b3d1cdf06c9e))
* improve mobile docs spacing ([0e7bda2](https://github.com/dedalus-labs/hollywood/commit/0e7bda2c6f6db4e05cecef5044ec0509dc58e2d5))
* link execve reference ([124b69b](https://github.com/dedalus-labs/hollywood/commit/124b69b660dedda737090144cf00c272dbbc719c))
* link release please flow ([7c7dcaa](https://github.com/dedalus-labs/hollywood/commit/7c7dcaad79c1877cc4f75b863d32ccb7f62f3487))
* move docs section higher ([2145b08](https://github.com/dedalus-labs/hollywood/commit/2145b082d832b94991fafba6e82ae216885aeb50))
* note small dependency surface ([d70adad](https://github.com/dedalus-labs/hollywood/commit/d70adadc80626b9b36ca1eabaf1a428f631d5def))
* polish public docs ([#3](https://github.com/dedalus-labs/hollywood/issues/3)) ([6a4eec5](https://github.com/dedalus-labs/hollywood/commit/6a4eec55b041c6786379854ca053d3c59e88f967))
* position hollywood as ai native ([dbbece5](https://github.com/dedalus-labs/hollywood/commit/dbbece5d07c5d6ff7ec711121f27340b145493d5))
* rename good fits to use cases ([87dbc38](https://github.com/dedalus-labs/hollywood/commit/87dbc384a10c7705fdf0c089ed24d7de4adbc066))
* require screenshots for rendered changes ([c3cd63e](https://github.com/dedalus-labs/hollywood/commit/c3cd63e2df3c24c1ca49a91213bb624e95cd45aa))
* **security:** document cicd policy ([3622f59](https://github.com/dedalus-labs/hollywood/commit/3622f59051e3e9a734f2705f6b46b5ee5b4ca913))
* **security:** update vulnerability contact ([605d129](https://github.com/dedalus-labs/hollywood/commit/605d129c26e123effb6d6c28ffe2327836848418))
* soften generated yaml guidance ([35e7b67](https://github.com/dedalus-labs/hollywood/commit/35e7b6755554ef4cb955a9ace0055eca871c22a3))
* soften site contrast ([0050abd](https://github.com/dedalus-labs/hollywood/commit/0050abd8758da4ba4a900dede9b1fb79308781c2))
* standardize mkdocs commands ([eb1f0fc](https://github.com/dedalus-labs/hollywood/commit/eb1f0fc5c7ff79736c1967ce88c09dc65c69cda2))
* theme hollywood site ([3fc45f0](https://github.com/dedalus-labs/hollywood/commit/3fc45f090eef84fd41031451606f77d7f19f2546))


### Refactors

* **ci:** enforce typed action dogfooding ([#32](https://github.com/dedalus-labs/hollywood/issues/32)) ([70244c2](https://github.com/dedalus-labs/hollywood/commit/70244c2775f427fbda07ba6f3ef76aa717ddf27c))
* **ci:** type flower workflow ([7fde1f2](https://github.com/dedalus-labs/hollywood/commit/7fde1f2449ea94b898e8e7342d695fb03cc6280f))
* **cla:** split contributor checks ([97031bf](https://github.com/dedalus-labs/hollywood/commit/97031bf6e0051b23d3c3a47454bf2b41bdfc5636))
* **cla:** use typed contributor actions ([09a3d42](https://github.com/dedalus-labs/hollywood/commit/09a3d42c5b128d87ab4b87fc8d841ee94c9850af))
* **cli:** add build command ([b90f776](https://github.com/dedalus-labs/hollywood/commit/b90f776f1ba108d23674f24548e348aa4deeca01))
* **cli:** rename command module ([e56b0c4](https://github.com/dedalus-labs/hollywood/commit/e56b0c46e3262cc07869b56cf231ff79bffc8153))

## [0.1.0-alpha.1](https://github.com/dedalus-labs/hollywood/compare/v0.0.1-alpha.1...v0.1.0-alpha.1) (2026-06-22)


### Features

* **github:** group action command logs ([#18](https://github.com/dedalus-labs/hollywood/issues/18)) ([b6390c7](https://github.com/dedalus-labs/hollywood/commit/b6390c76b246028e18b0b9eece76c338a84ce546))


### Bug Fixes

* **ci:** bootstrap local action checks ([22214d7](https://github.com/dedalus-labs/hollywood/commit/22214d76c68a094c6432e3dcd94f26c726ca9515))
* **ci:** publish prereleases to latest before ga ([#16](https://github.com/dedalus-labs/hollywood/issues/16)) ([332dd32](https://github.com/dedalus-labs/hollywood/commit/332dd32e6d02697bb770c4c1e356ef7689d1c503))
* **cla:** split contributor checks ([356cdaa](https://github.com/dedalus-labs/hollywood/commit/356cdaa1370a86ad40f93059f0a2cfb62a1d5698))
* **cla:** trust release automation author ([19dd0cb](https://github.com/dedalus-labs/hollywood/commit/19dd0cbee9b76a96b051e593dfca5b78a8565392))
* **gha:** request write pr token for flowers ([#14](https://github.com/dedalus-labs/hollywood/issues/14)) ([26e485f](https://github.com/dedalus-labs/hollywood/commit/26e485f0abaebc63e0070e42604a48dc1f03603c))
* **gha:** trust cind bot rename ([#12](https://github.com/dedalus-labs/hollywood/issues/12)) ([f2520bf](https://github.com/dedalus-labs/hollywood/commit/f2520bf3d16262b4a4249170eca45b63aa3cebde))
* **security:** add GitHub private vulnerability reporting ([#17](https://github.com/dedalus-labs/hollywood/issues/17)) ([e5d9c6f](https://github.com/dedalus-labs/hollywood/commit/e5d9c6f461461bdc0919c99d2376f61208d9078a))


### Chores

* **actions:** rename local action script ([b686a1d](https://github.com/dedalus-labs/hollywood/commit/b686a1d1772210349468d3d2472fcdd82ba6b686))


### Refactors

* **cla:** split contributor checks ([97031bf](https://github.com/dedalus-labs/hollywood/commit/97031bf6e0051b23d3c3a47454bf2b41bdfc5636))
* **cla:** use typed contributor actions ([09a3d42](https://github.com/dedalus-labs/hollywood/commit/09a3d42c5b128d87ab4b87fc8d841ee94c9850af))
* **cli:** add build command ([b90f776](https://github.com/dedalus-labs/hollywood/commit/b90f776f1ba108d23674f24548e348aa4deeca01))

## [0.0.1-alpha.1](https://github.com/dedalus-labs/hollywood/compare/v0.0.1-alpha.0...v0.0.1-alpha.1) (2026-06-16)


### Bug Fixes

* **ci:** allow cla bootstrap maintainers ([989008c](https://github.com/dedalus-labs/hollywood/commit/989008cf4ff85ac846c378b20c651916d6998d4a))
* **ci:** allow owner cla bootstrap ([f10a2a4](https://github.com/dedalus-labs/hollywood/commit/f10a2a4422b4afa95febc1a46281484441ced716))
* **cli:** read version from package metadata ([e2876d4](https://github.com/dedalus-labs/hollywood/commit/e2876d4a579fa769689a395651004ce1c721373d))
* **cli:** read version from package metadata ([#10](https://github.com/dedalus-labs/hollywood/issues/10)) ([b73ace5](https://github.com/dedalus-labs/hollywood/commit/b73ace5069b6f1c46dbc5a49a5c7d25e63e73674))


### Chores

* add npm discovery keywords ([b89f511](https://github.com/dedalus-labs/hollywood/commit/b89f511efd9c7f51abe4c47f57eb5e1de3de92fa))
* **build:** enforce source build boundary ([8c42d45](https://github.com/dedalus-labs/hollywood/commit/8c42d4580a850818d1a9346c15ae1ca561845af6))
* **ci:** add merged pr flower workflow ([9c91677](https://github.com/dedalus-labs/hollywood/commit/9c916771e1205ebcab558e9f3b42572fe80048ef))
* **ci:** gate external pr tests ([c34c279](https://github.com/dedalus-labs/hollywood/commit/c34c279d28a1743943492bde5c1c6eb2eeab951e))
* **ci:** reject handwritten action yaml ([b7ff8b7](https://github.com/dedalus-labs/hollywood/commit/b7ff8b71ccd87e86b2b3de992cc100d4875aba95))
* **ci:** update release please action ([0ebfdcc](https://github.com/dedalus-labs/hollywood/commit/0ebfdcc37fea6b3dd27c8b911a8f0a2f10050561))
* **ci:** use cind for release please ([0f976f5](https://github.com/dedalus-labs/hollywood/commit/0f976f567dc12932a035e350e5c66781013c015e))
* **ci:** use node 24 actions ([dbd4a35](https://github.com/dedalus-labs/hollywood/commit/dbd4a358acbcb368815c6de38edb9940f32e5975))
* **cli:** add check command ([56af6cb](https://github.com/dedalus-labs/hollywood/commit/56af6cb474db04b1abf69e787194623dc55d1caa))
* **generate:** space generated headers ([d8b4d04](https://github.com/dedalus-labs/hollywood/commit/d8b4d04f645cad8adff33429b3a8c3c7fac35282))
* **gha:** rename workflow sources ([1fad45b](https://github.com/dedalus-labs/hollywood/commit/1fad45bde83137a8766173d658ca854498088a6d))
* **github:** add codeowners ([3db719e](https://github.com/dedalus-labs/hollywood/commit/3db719eb678b4ca8ac5ab20b3c48364fd0126c27))
* **github:** add community templates ([b48b630](https://github.com/dedalus-labs/hollywood/commit/b48b63045d6e0a9f2dfb543a1fa3beba1c5e4e25))
* harden public release ([a4510ab](https://github.com/dedalus-labs/hollywood/commit/a4510ab44c19937b8c5797c3ad99a2feca2a6539))
* init ([76f50e8](https://github.com/dedalus-labs/hollywood/commit/76f50e832f311c43a724f584da1d52285b0beefd))
* **npm:** use dedalus-labs scope ([47c9fad](https://github.com/dedalus-labs/hollywood/commit/47c9fad4e723fb778c7b022e3fe5cf31652cb4ca))
* prepare hollywood oss release ([13bdbb0](https://github.com/dedalus-labs/hollywood/commit/13bdbb09011ffee9c91a3ea4ae52d208e3da682c))
* **release:** add npm publishing pipeline ([623cad6](https://github.com/dedalus-labs/hollywood/commit/623cad6e2026c13d7d01dcdfa046d34b37161d6d))
* support node 20 runtime ([9b6e8ab](https://github.com/dedalus-labs/hollywood/commit/9b6e8ab453c5560d2b08bc32f00806a99d0e3e19))
* **tooling:** adopt website checks ([1ae7cb2](https://github.com/dedalus-labs/hollywood/commit/1ae7cb297066ed9d3e0712f7064c87b088b752a5))


### Documentation

* add execution backend docs ([6691ea2](https://github.com/dedalus-labs/hollywood/commit/6691ea22f92c6c23f4caa91d05045fbc51dabd4f))
* add license section ([107adf5](https://github.com/dedalus-labs/hollywood/commit/107adf5d911b67f05698c455cc000b2902f788ef))
* add license section ([#11](https://github.com/dedalus-labs/hollywood/issues/11)) ([72855a0](https://github.com/dedalus-labs/hollywood/commit/72855a053a84ecdd0e4a3d20149369eee63e0f49))
* add oss site ([a82d7d4](https://github.com/dedalus-labs/hollywood/commit/a82d7d4ae62286869a1146c8eb995951a0c1f356))
* add premiere styling ([d710626](https://github.com/dedalus-labs/hollywood/commit/d710626b98e76c72333c60c5f0553837b9d7c98c))
* add public roadmap ([7a07e7c](https://github.com/dedalus-labs/hollywood/commit/7a07e7c711c1301872893a44964f22a5051a8549))
* clarify contribution trust flow ([54296be](https://github.com/dedalus-labs/hollywood/commit/54296be7d1449d8b37a5084efaceb1c1de77b55a))
* clarify contributor pr flow ([014ab4f](https://github.com/dedalus-labs/hollywood/commit/014ab4f1172280c47b83319c19811baa418604be))
* document node requirements ([318bded](https://github.com/dedalus-labs/hollywood/commit/318bded9c2435f1186e3202753f42f1915b1f2c9))
* document release flow ([3c97e1b](https://github.com/dedalus-labs/hollywood/commit/3c97e1b2de2799693191f40ec9c643360731af05))
* emphasize typed action validation ([53f90d7](https://github.com/dedalus-labs/hollywood/commit/53f90d7e90a8b09f37e731be9a78cc81ff900342))
* explain action adapter ([26d9605](https://github.com/dedalus-labs/hollywood/commit/26d96057aa0027e98be52d082fa94ff8e126431f))
* explain hollywood binary usage ([4600471](https://github.com/dedalus-labs/hollywood/commit/460047165d410eb58f1c095abe7b9cd93bd0360b))
* explain vouch flow in readme ([d87120f](https://github.com/dedalus-labs/hollywood/commit/d87120fcb7ecfabc39a00db570bcbfd441fe1116))
* generalize public examples ([388c695](https://github.com/dedalus-labs/hollywood/commit/388c6956bd5b5a8ba9ff21b81428b3d1cdf06c9e))
* improve mobile docs spacing ([0e7bda2](https://github.com/dedalus-labs/hollywood/commit/0e7bda2c6f6db4e05cecef5044ec0509dc58e2d5))
* link execve reference ([124b69b](https://github.com/dedalus-labs/hollywood/commit/124b69b660dedda737090144cf00c272dbbc719c))
* link release please flow ([7c7dcaa](https://github.com/dedalus-labs/hollywood/commit/7c7dcaad79c1877cc4f75b863d32ccb7f62f3487))
* move docs section higher ([2145b08](https://github.com/dedalus-labs/hollywood/commit/2145b082d832b94991fafba6e82ae216885aeb50))
* note small dependency surface ([d70adad](https://github.com/dedalus-labs/hollywood/commit/d70adadc80626b9b36ca1eabaf1a428f631d5def))
* polish public docs ([#3](https://github.com/dedalus-labs/hollywood/issues/3)) ([6a4eec5](https://github.com/dedalus-labs/hollywood/commit/6a4eec55b041c6786379854ca053d3c59e88f967))
* position hollywood as ai native ([dbbece5](https://github.com/dedalus-labs/hollywood/commit/dbbece5d07c5d6ff7ec711121f27340b145493d5))
* rename good fits to use cases ([87dbc38](https://github.com/dedalus-labs/hollywood/commit/87dbc384a10c7705fdf0c089ed24d7de4adbc066))
* require screenshots for rendered changes ([c3cd63e](https://github.com/dedalus-labs/hollywood/commit/c3cd63e2df3c24c1ca49a91213bb624e95cd45aa))
* **security:** document cicd policy ([3622f59](https://github.com/dedalus-labs/hollywood/commit/3622f59051e3e9a734f2705f6b46b5ee5b4ca913))
* **security:** update vulnerability contact ([605d129](https://github.com/dedalus-labs/hollywood/commit/605d129c26e123effb6d6c28ffe2327836848418))
* soften generated yaml guidance ([35e7b67](https://github.com/dedalus-labs/hollywood/commit/35e7b6755554ef4cb955a9ace0055eca871c22a3))
* soften site contrast ([0050abd](https://github.com/dedalus-labs/hollywood/commit/0050abd8758da4ba4a900dede9b1fb79308781c2))
* standardize mkdocs commands ([eb1f0fc](https://github.com/dedalus-labs/hollywood/commit/eb1f0fc5c7ff79736c1967ce88c09dc65c69cda2))
* theme hollywood site ([3fc45f0](https://github.com/dedalus-labs/hollywood/commit/3fc45f090eef84fd41031451606f77d7f19f2546))


### Refactors

* **ci:** type flower workflow ([7fde1f2](https://github.com/dedalus-labs/hollywood/commit/7fde1f2449ea94b898e8e7342d695fb03cc6280f))
* **cli:** rename command module ([e56b0c4](https://github.com/dedalus-labs/hollywood/commit/e56b0c46e3262cc07869b56cf231ff79bffc8153))
