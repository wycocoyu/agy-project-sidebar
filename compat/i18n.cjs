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
    },
  };
  return dict[lang] || dict['zh-CN'];
};
