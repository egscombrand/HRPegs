
import { subDays, differenceInDays, startOfDay, format, isToday, isAfter, isBefore } from 'date-fns';
import type { JobApplication, Job } from '@/lib/types';
import { statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { getApplicationFilterStage } from '@/lib/recruitment/application-stage';

export type FilterState = {
  dateRange: { from?: Date | null; to?: Date | null };
  jobIds?: string[];
  recruiterIds?: string[];
  stages?: string[];
};

const countBy = <T,>(arr: T[], fn: (item: T) => string | number | undefined) => {
    return arr.reduce((acc, item) => {
        const key = fn(item);
        if (key === undefined) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {} as Record<string | number, number>);
};

export const calculateKpis = (applications: JobApplication[], filters: FilterState) => {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);
  const rangeStart = filters.dateRange.from || subDays(now, 30);
  const rangeEnd = filters.dateRange.to || now;

  // Base filters
  const appsInDateRange = applications.filter(app => {
    const appliedDate = app.submittedAt?.toDate();
    return appliedDate && appliedDate >= rangeStart && appliedDate <= rangeEnd;
  });

  const activeCandidates = applications.filter(app => !['hired', 'rejected', 'draft'].includes(getApplicationFilterStage(app)));
  const candidatesNewThisWeek = applications.filter(app => {
    const appliedDate = app.submittedAt?.toDate();
    return appliedDate && appliedDate >= sevenDaysAgo;
  });

  const hiredInDateRange = applications.filter(app =>
    getApplicationFilterStage(app) === 'hired' && app.updatedAt.toDate() >= rangeStart && app.updatedAt.toDate() <= rangeEnd
  );

  const rejectedInDateRange = applications.filter(app =>
    getApplicationFilterStage(app) === 'rejected' && app.updatedAt.toDate() >= rangeStart && app.updatedAt.toDate() <= rangeEnd
  );

  // Time to Hire calculation
  const timeToHireDays = hiredInDateRange
    .filter(app => app.submittedAt)
    .map(app => differenceInDays(app.updatedAt.toDate(), app.submittedAt!.toDate()))
    .sort((a, b) => a - b);

  const medianTimeToHire = timeToHireDays.length > 0
    ? timeToHireDays[Math.floor(timeToHireDays.length / 2)]
    : 0;

  // Interviews Today - dari app.interviews[] embedded array
  const interviewsToday = applications.reduce((count, app) => {
    if (!app.interviews || !Array.isArray(app.interviews)) return count;
    return count + app.interviews.filter(iv =>
      iv.status === 'scheduled' && isToday(iv.startAt.toDate())
    ).length;
  }, 0);

  // Offers Pending - status 'offered' atau offerStatus sent/viewed
  const offersPending = activeCandidates.filter(app =>
    getApplicationFilterStage(app) === 'offered' || (app as any).offerStatus?.includes('sent') || (app as any).offerStatus?.includes('viewed')
  ).length;

  // Offer Acceptance Rate
  const offeredCandidates = applications.filter(app => getApplicationFilterStage(app) === 'offered' || (app as any).offerStatus);
  const acceptedOffers = applications.filter(app =>
    getApplicationFilterStage(app) === 'hired' && ((app as any).offerStatus === 'accepted' || getApplicationFilterStage(app) === 'hired')
  );
  const offerAcceptanceRate = offeredCandidates.length > 0
    ? (acceptedOffers.length / offeredCandidates.length) * 100
    : 0;

  // Candidates Overdue (> 7 days in current stage)
  const overdueCandidates = activeCandidates.filter(app => {
    if (!app.updatedAt) return false;
    const daysInStage = differenceInDays(now, app.updatedAt.toDate());
    return daysInStage > 7;
  }).length;

  // Average Time to First Response - dari submitted ke stage pertama
  const appsWithSubmitted = applications.filter(app => app.submittedAt && getApplicationFilterStage(app) !== 'submitted' && getApplicationFilterStage(app) !== 'draft');
  const avgTimeToFirstResponse = appsWithSubmitted.length > 0
    ? Math.round(
        appsWithSubmitted.reduce((sum, app) => {
          const diff = differenceInDays(app.updatedAt.toDate(), app.submittedAt!.toDate());
          return sum + diff;
        }, 0) / appsWithSubmitted.length
      )
    : 0;

  return {
    newApplicants: appsInDateRange.length,
    activeCandidates: activeCandidates.length,
    candidatesNewThisWeek: candidatesNewThisWeek.length,
    inInterview: activeCandidates.filter(app => getApplicationFilterStage(app) === 'interview').length,
    inOffered: activeCandidates.filter(app => getApplicationFilterStage(app) === 'offered').length,
    inScreening: activeCandidates.filter(app => ['screening', 'verification'].includes(getApplicationFilterStage(app))).length,
    assessmentPending: activeCandidates.filter(app => getApplicationFilterStage(app) === 'tes_kepribadian').length,
    avgTimeToHire: medianTimeToHire,
    interviewsToday,
    offersPending,
    offerAcceptanceRate,
    overdueCandidates,
    avgTimeToFirstResponse,
    hired: hiredInDateRange.length,
    rejected: rejectedInDateRange.length,
  };
};

export const getFunnelData = (applications: JobApplication[]) => {
  const stageOrder: JobApplication['status'][] = ['submitted', 'tes_kepribadian', 'verification', 'document_submission', 'interview', 'hired'];
  
  const stageCounts = countBy(applications, app => getApplicationFilterStage(app));

  let cumulativeCount = applications.filter(app => app.status !== 'draft').length;
  if(cumulativeCount === 0) return [];

  const funnel = stageOrder.map((stage, index) => {
    const count = stageCounts[stage] || 0;
    const previousStageCount = index > 0 ? (stageCounts[stageOrder[index-1]] || 0) : cumulativeCount;
    
    // For 'hired', the conversion is from the previous step ('interview'), not the total.
    let rate = 0;
    if (index === 0) {
      // The first stage's "conversion" isn't meaningful in the same way, but can be shown as 100% of its own count
      rate = 100;
    } else if (previousStageCount > 0) {
      // Calculate how many progressed from the previous stage to this one. This requires a more complex model with stage history.
      // A simplified approach: assume anyone in a later stage must have passed through the previous one.
      const cumulativeLaterStages = stageOrder.slice(index).reduce((sum, s) => sum + (stageCounts[s] || 0), 0);
      const cumulativeCurrentAndLater = stageOrder.slice(index - 1).reduce((sum, s) => sum + (stageCounts[s] || 0), 0);
      rate = cumulativeCurrentAndLater > 0 ? (cumulativeLaterStages / cumulativeCurrentAndLater) * 100 : 0;
    }

    return {
      stage: statusDisplayLabels[stage],
      count: count,
      rate: parseFloat(rate.toFixed(1))
    };
  });

  return funnel.filter(f => f.count > 0 || f.stage === 'Terkirim');
};


export const getApplicantsTrend = (applications: JobApplication[], filters: FilterState) => {
    const now = new Date();
    const rangeStart = filters.dateRange.from || subDays(now, 30);
    const rangeEnd = filters.dateRange.to || now;

    const appsInDateRange = applications.filter(app => {
        const appliedDate = app.submittedAt?.toDate();
        return appliedDate && appliedDate >= rangeStart && appliedDate <= rangeEnd;
    });

    const trendData = countBy(appsInDateRange, app => format(startOfDay(app.submittedAt!.toDate()), 'yyyy-MM-dd'));

    const result = Object.entries(trendData).map(([date, applicants]) => ({
        date,
        applicants,
    })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return result;
};


export const getSourcePerformance = (applications: JobApplication[]) => {
    // This cannot be implemented until a 'source' field is added to the JobApplication data model.
    return [];
};

export const getJobPerformance = (applications: JobApplication[], jobs?: Job[]) => {
  // Group applications by jobId and calculate performance metrics
  const jobStats = countBy(applications, app => app.jobId);
  const jobMap = (jobs || []).reduce((acc, job) => ({ ...acc, [job.id!]: job }), {} as Record<string, Job>);

  const jobPerformance = Object.entries(jobStats)
    .map(([jobId, totalApps]) => {
      const jobApps = applications.filter(app => app.jobId === jobId);
      const job = jobMap[jobId];

      const stageBreakdown = countBy(jobApps, app => getApplicationFilterStage(app));
      const hired = jobApps.filter(app => getApplicationFilterStage(app) === 'hired').length;
      const interviewed = jobApps.filter(app => getApplicationFilterStage(app) === 'interview').length;
      const offered = jobApps.filter(app => getApplicationFilterStage(app) === 'offered').length;
      const activeApps = jobApps.filter(app => !['hired', 'rejected', 'draft'].includes(getApplicationFilterStage(app))).length;

      const conversionRate = totalApps > 0 ? (hired / totalApps) * 100 : 0;

      return {
        jobId,
        position: job?.position || 'Unknown Position',
        brand: job?.brandName || 'Unknown Brand',
        totalApplicants: totalApps,
        activeApplicants: activeApps,
        interviewed,
        offered,
        hired,
        conversionRate: parseFloat(conversionRate.toFixed(1)),
        status: job?.publishStatus || 'unknown',
      };
    })
    .sort((a, b) => b.totalApplicants - a.totalApplicants);

  return jobPerformance;
};
