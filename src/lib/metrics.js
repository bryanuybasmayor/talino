/**
 * Single source of truth for computed numbers.
 * Re-exports the server metrics module so the browser and API agree.
 */
export {
  computeKPIDeltas,
  computeEngagementRate,
  computeEMVPerPost,
  computeEMVPer1KReach,
  computeLANUEfficiency,
  computeCampaignMetrics,
  computeFormatProportions,
  computeSentimentSplit,
  computeEmotionMix,
  computeTopicRanking,
  computePlatformSentiment,
  computeGeoDistribution,
  computeWeeklyVolume,
  computeLanguageSentiment,
  computeKeywords,
  computeTopVoices,
  computeShareOfVoice,
  computeViralPosts,
  computePeakWeeks,
  computeHeadlineStrip,
  toLongTags,
  computeListeningMetrics,
} from '../../server/lib/metrics.js';
