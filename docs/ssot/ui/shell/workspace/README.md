# WORK 主工作区

ID：WORK。父：[SHELL](../README.md)。子：[HEAD](header.md)、[FEEDBACK](feedback.md)、[CHAT](conversation/README.md)、[ARTIFACTS](artifacts/README.md)。

从上到下：HEAD固定自然高度 → FEEDBACK仅需要时占位 → 内容带flex占余量。内容带从左到右CHAT填余量、ARTIFACTS按需并排或覆盖。CHAT含阅读和输入，ARTIFACTS不能缩窄顶部动作区。主工作区自身不滚动，读区与成果栏各自拥有滚动；子内容min-height:0。

顶部保持会话身份；错误属于哪一层就在该层展示。已知没有会话时仍保留导航入口与新建引导，输入不可发送且原因可达。没有成果时不自动开空栏。不同会话的阅读/草稿/成果选择按原身份隔离。

空间预算继承[共享参数](../../foundations.md)：HEAD与输入优先可达，正文取得剩余高度；反馈变长不能无上限挤掉正文。内容带成果覆盖时CHAT不可操作，HEAD仍可达；窄窗NAV模态优先于整个WORK。

源码：[renderer](../../../../../apps/desktop/renderer.tsx)。现状：对应main/content-grid已存在，配置/多个notice可累积占高；目标需统一反馈占位与主轴。验收：配置缺失＋断线＋跨会话执行、长错误、低高度/200%，不出现两套全局停止或页面级滚动，操作反馈不遮标题。
