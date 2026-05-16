'use strict';

const {
  EMAIL_BUILDER_GROUP,
  EMAIL_BUILDER_OPERATION_TYPES,
  OP_LABELS
} = require('./constants');

function addUsageGroupingFieldsStage() {
  const isEmailBuilderUsage = { $in: ['$operationType', EMAIL_BUILDER_OPERATION_TYPES] };

  return {
    $addFields: {
      usageGroup: {
        $cond: [isEmailBuilderUsage, EMAIL_BUILDER_GROUP, '$operationType']
      },
      isEmailBuilderUsage
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
    rawId: { $cond: ['$isEmailBuilderUsage', null, '$_id'] }
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
            { $eq: ['$operationType', EMAIL_BUILDER_GROUP] },
            {
              $concat: [
                EMAIL_BUILDER_GROUP,
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
            { $eq: ['$operationType', EMAIL_BUILDER_GROUP] },
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
