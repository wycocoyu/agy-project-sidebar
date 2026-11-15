module.exports = function createI18n(lang = 'zh-CN') {
  const dict = {
    'zh-CN': {
      labels: {
        project: 'Project',
        requirement: 'Requirement',
        repo: 'Repo',
        location: 'Environment',
        status: 'Status',
        none: 'None',
      },
      standalone: 'Standalone',
      statusBlocked: 'Blocked',
      statusInProgress: 'In Progress',
      statusIdle: 'Idle',
      envLocal: 'This Computer',
      envCloud: 'Remote',
      showMore: 'Show more',
      expandReadIdle: '▸ 展开其余 {n} 条已读空闲会话',
      collapseReadIdle: '▾ 收起 {n} 条已读空闲会话',
    },
    en: {
      labels: {
        project: 'Project',
        requirement: 'Requirement',
        repo: 'Repo',
        location: 'Environment',
        status: 'Status',
        none: 'None',
      },
      standalone: 'Standalone',
      statusBlocked: 'Blocked',
      statusInProgress: 'In Progress',
      statusIdle: 'Idle',
      envLocal: 'This Computer',
      envCloud: 'Remote',
      showMore: 'Show more',
      expandReadIdle: '▸ Show {n} read idle',
      collapseReadIdle: '▾ Hide {n} read idle',
    },
  };
  return dict[lang] || dict['zh-CN'];
};
