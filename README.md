# 带薪养生 - Chrome插件

> 打工人专属提醒——喝水、尿遁、午饭、下班、发薪，一个都不能少！

## ✨ 功能特性

- **🍵 喝水提醒** - 自定义间隔，追踪每日 8 杯水目标
- **🦘 尿遁提醒** - 自定义间隔，摸鱼养生两不误
- **🍜 午饭提醒** - 自定义时间，干饭不能少
- **🏠 下班提醒** - 自定义时间，快乐下班
- **💰 发薪提醒** - 自定义日期，打工人最期待的日子

## 🎨 界面风格

蓝灰色调 + 趣味 emoji 风格，简洁美观。

## 📦 安装方式

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目 `src/` 目录
5. 完成！图标会出现在 Chrome 工具栏

## 🖱️ 使用方式

- **点击工具栏图标**：打开弹窗，查看今日提醒列表和喝水进度
- **点击弹窗中的「设置」**：进入设置页面自定义提醒时间和工作模式
- **通知弹出时**：
  - 点击「💧 我喝了」（喝水专属）确认
  - 点击「❌ 忽略」跳过本次提醒

## ⚙️ 自定义设置

### 工作模式
- **每天**：每天提醒
- **周一至周五**：工作日提醒
- **2026年工作日**：含法定节假日及调休安排
- **个性化勾选**：自由选择工作日

### 提醒配置
在设置页面可以调整各项提醒的时间/频率。

## 📁 项目结构

```
src/
├── manifest.json          # 扩展配置
├── background.js          # 后台 Service Worker
├── utils.js               # 公共工具
├── popup/
│   ├── popup.html         # 弹窗界面
│   ├── popup.css          # 弹窗样式
│   └── popup.js           # 弹窗交互
├── options/
│   ├── options.html       # 设置页面
│   ├── options.css        # 设置页样式
│   └── options.js         # 设置页交互
└── icons/
    ├── icon-16.png        # 扩展图标
    ├── icon-48.png
    └── icon-128.png
```

## 🛠️ 技术栈

- Chrome Extensions Manifest V3
- Vanilla HTML5 + CSS3 + ES6
- Chrome Alarms API（定时提醒）
- Chrome Storage API（数据持久化）
- Chrome Notifications API（系统通知）

## 📄 License

MIT License
