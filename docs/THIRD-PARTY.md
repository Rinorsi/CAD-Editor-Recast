# 第三方数据

- 拼音数据来自 [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data)，MIT License，Copyright (c) 2016 mozillazg；固定0.16.0提交 fe29ad32bdf352b31a02b9936e537f575432e9a6，完整许可随生成的 pinyin-data.js 保留；node tools/gen-pinyin.mjs 生成，node tools/gen-pinyin.mjs --check 自检。字集为GB2312全部6763汉字、通用规范汉字8105字、Big5常用区5401字和Minecraft 26.1.2官方简繁语言资源全部汉字的并集，所有读音来自上游pinyin.txt，去声调、ü写v。生成需要Node 18+及Python 3标准库；MC_ASSETS_DIR可指定原版assets目录，否则读取Gradle资源缓存，缺少时下载官方资源到系统临时目录并校验SHA-1；上游文件固定SHA-256，完成后清理临时目录。语言文本仅用于筛选字集，不复制到生成物。
