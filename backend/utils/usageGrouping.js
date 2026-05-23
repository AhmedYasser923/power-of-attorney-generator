'use strict';

const {
  EMAIL_BUILDER_GROUP,
  EMAIL_BUILDER_OPERATION_TYPES,
  ANNOUNCEMENT_GROUP,
  ANNOUNCEMENT_OPERATION_TYPES,
  TRACKERS_GROUP,
  TRACKER_OPERATION_TYPES,
  DOC_CHECK_GROUP,
  DOC_CHECK_OPERATION_TYPES,
  IATA_LOOKUP_GROUP,
  IATA_LOOKUP_OPERATION_TYPES,
  JURISDICTION_GROUP,
  JURISDICTION_OPERATION_TYPES,
  EC261_GROUP,
  EC261_OPERATION_TYPES,
  OP_LABELS
} = require('./constants');

const USAGE_GROUPS = [
  { group: EMAIL_BUILDER_GROUP, types: EMAIL_BUILDER_OPERATION_TYPES },
  { group: ANNOUNCEMENT_GROUP, types: ANNOUNCEMENT_OPERATION_TYPES },
  { group: TRACKERS_GROUP, types: TRACKER_OPERATION_TYPES },
  { group: DOC_CHECK_GROUP, types: DOC_CHECK_OPERATION_TYPES },
  { group: IATA_LOOKUP_GROUP, types: IATA_LOOKUP_OPERATION_TYPES },
  { group: JURISDICTION_GROUP, types: JURISDICTION_OPERATION_TYPES },
  { group: EC261_GROUP, types: EC261_OPERATION_TYPES }
];

const GROUP_NAMES = USAGE_GROUPS.map(({ group }) => group);
const ALL_GROUPED_TYPES = USAGE_GROUPS.flatMap(({ types }) => types);

function addUsageGroupingFieldsStage() {
  return {
    $addFields: {
      usageGroup: {
        $switch: {
          branches: USAGE_GROUPS.map(({ group, types }) => ({
            case: { $in: ['$operationType', types] },
            then: group
          })),
          default: '$operationType'
        }
      },
      isGroupedUsage: { $in: ['$operationType', ALL_GROUPED_TYPES] }
    }
  };
}

function getUsageBreakdownStages() {
  return [
    addUsageGroupingFieldsStage(),
    {
      $group: {
        _id: '$usageGroup',
        count: { $sum: 1 },
        totalCostUSD: { $sum: '$costUSD' }
      }
    },
    { $sort: { totalCostUSD: -1 } }
  ];
}

function getGroupedLogStages({ perUser = false } = {}) {
  const groupId = {
    usageGroup: '$usageGroup',
    rawId: { $cond: ['$isGroupedUsage', null, '$_id'] }
  };

  if (perUser) {
    groupId.userId = '$userId';
  }

  return [
    addUsageGroupingFieldsStage(),
    {
      $group: {
        _id: groupId,
        operationType: { $first: '$usageGroup' },
        userId: { $first: '$userId' },
        userName: { $first: '$userName' },
        createdAt: { $max: '$createdAt' },
        costUSD: { $sum: '$costUSD' },
        inputTokens: { $sum: '$inputTokens' },
        outputTokens: { $sum: '$outputTokens' },
        operationCount: { $sum: 1 },
        rawOperationTypes: { $addToSet: '$operationType' },
        model: {
          $top: {
            sortBy: { createdAt: -1 },
            output: '$model'
          }
        },
        firstMetadata: { $first: '$metadata' }
      }
    },
    {
      $project: {
        _id: {
          $cond: [
            { $in: ['$operationType', GROUP_NAMES] },
            {
              $concat: [
                '$operationType',
                ':',
                { $toString: '$userId' },
                ':',
                {
                  $dateToString: {
                    format: '%Y-%m-%dT%H:%M:%S.%LZ',
                    date: '$createdAt',
                    timezone: 'UTC'
                  }
                }
              ]
            },
            { $toString: '$_id.rawId' }
          ]
        },
        operationType: 1,
        userId: 1,
        userName: 1,
        createdAt: 1,
        costUSD: 1,
        inputTokens: 1,
        outputTokens: 1,
        operationCount: 1,
        model: 1,
        metadata: {
          $cond: [
            { $in: ['$operationType', GROUP_NAMES] },
            {
              grouped: true,
              operationCount: '$operationCount',
              rawOperationTypes: '$rawOperationTypes'
            },
            '$firstMetadata'
          ]
        }
      }
    }
  ];
}

function labelUsageRows(rows) {
  return rows.map(row => ({
    ...row,
    label: OP_LABELS[row.operationType || row._id] || row.operationType || row._id
  }));
}

module.exports = {
  getUsageBreakdownStages,
  getGroupedLogStages,
  labelUsageRows
};
