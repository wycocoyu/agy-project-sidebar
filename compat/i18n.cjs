module.exports = function createI18n(lang = 'zh-CN') {
  const dict = {
    'zh-CN': {
      filterPrefix: '需求',
      allLabel: '全部',
      allNative: '全部对话（原生列表）',
      searchPlaceholder: '筛选需求 / 单号...',
      dropdownSearchPlaceholder: '搜索需求名或单号...',
      requirementsGroup: '需求列表',
      inbox: '未归类会话',
      clearFilter: '清除过滤',
      empty: '未找到匹配的对话',
      running: '进行中',
      noReqFound: '无匹配需求',
    },
    en: {
      filterPrefix: 'Req',
      allLabel: 'All',
      allNative: 'All Conversations (Native)',
      searchPlaceholder: 'Filter req / issue...',
      dropdownSearchPlaceholder: 'Search requirements...',
      requirementsGroup: 'Requirements',
      inbox: 'Standalone',
      clearFilter: 'Clear',
      empty: 'No matching conversations',
      running: 'Running',
      noReqFound: 'No matching requirements',
    },
  };
  return dict[lang] || dict['zh-CN'];
};
