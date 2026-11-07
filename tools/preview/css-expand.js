setTimeout(function () { (UI.page && UI.page.cards || []).forEach(function (c) { try { c.setCollapsed(false); } catch (e) {} }); }, 100);
