module.exports = function createI18n(lang = 'zh-CN') {
  const dict = {
    'zh-CN': {
      menuOption: 'Requirement',
      standalone: 'Standalone',
      showMore: 'Show more',
      empty: 'No conversations found',
    },
    en: {
      menuOption: 'Requirement',
      standalone: 'Standalone',
      showMore: 'Show more',
      empty: 'No conversations found',
    },
  };
  return dict[lang] || dict['zh-CN'];
};
