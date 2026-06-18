# reminder - Chrome 扩展

打工人专属提醒：喝水、休息、午饭、下班，一个都不能少。

## 功能特点

- **喝水提醒**：自定义间隔，每日 8 杯水达标
- **久坐提醒**：自定义间隔，提醒打工人久坐 2 小时
- **午饭提醒**：自定义时间，午饭不能少
- **小憩提醒**：自定义时间，杜绝小憩
- **下班提醒**：自定义日期，打工人最期待的日期

## 界面展示

暗色 Steam 风格 + 趣味 emoji 样式，美观耐看。

## 安装步骤

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角开发者模式
3. 点击加载已解压的扩展程序
4. 选择本项目目录
5. 完成后，图标会出现在 Chrome 工具栏

## 使用方法

- **点击工具栏图标**：打开弹出窗口，查看今日提醒进展和水杯进度
- **点击窗口内的设置**：进入设置页面自定义提醒时间和功能设置
- **通知弹出时**：
  - 点击“我喝了”可标记喝水已喝
  - 点击“稍后提醒”会在之后再次提醒

## 自定义设置

### 工作模式

- **每天**：每天提醒
- **工作日**：工作日提醒
- **2026 节假日**：包含国务院节假日
- **自定义日期**：自定义工作日

### 提醒设置

在设置页面可以调整各提醒的时间 / 频率。

## 项目结构

```text
README.md
manifest.json
background.js
achievements/
    achievements.css
    achievements.html
    achievements.js
core/
    background.js
    messages.js
    theme.css
    tips.js
    utils.js
icons/
    icon-16.png
    icon-48.png
    icon-128.png
logs/
    logs.css
    logs.html
    logs.js
options/
    options.css
    options.html
    options.js
popup/
    popup.css
    popup.html
    popup.js
stats/
    stats.css
    stats.html
    stats.js
```

## 技术栈

- Chrome Extensions Manifest V3
- Vanilla HTML5 + CSS3 + ES6
- Chrome Alarms API（定时提醒）
- Chrome Storage API（数据本地化）
- Chrome Notifications API（系统通知）

## License

MIT License

