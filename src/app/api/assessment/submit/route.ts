
'use client';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { Assessment, AssessmentTemplate, AssessmentQuestion, AssessmentSession } from '@/lib/types';
import { analyzePersonalityArchetype } from '@/ai/flows/analyze-personality-archetype-flow';

// Helper function to get the max possible score for a Likert dimension
function getMaxScore(questions: AssessmentQuestion[], dimensionKey: string, engineKey: 'disc' | 'bigfive', scalePoints: number) {
    return questions
        .filter(q => q.type === 'likert' && q.engineKey === engineKey && q.dimensionKey === dimensionKey)
        .reduce((sum, q) => sum + (scalePoints * (q.weight || 1)), 0);
}

// Helper function to get the min possible score for a Likert dimension
function getMinScore(questions: AssessmentQuestion[], dimensionKey: string, engineKey: 'disc' | 'bigfive') {
    return questions
        .filter(q => q.type === 'likert' && q.engineKey === engineKey && q.dimensionKey === dimensionKey)
        .reduce((sum, q) => sum + (1 * (q.weight || 1)), 0);
}


export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const { sessionId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID is required.' }, { status: 400 });
  }

  const db = admin.firestore();
  const sessionRef = db.collection('assessment_sessions').doc(sessionId as string);

  try {
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }
    const session = { ...sessionDoc.data(), id: sessionDoc.id } as AssessmentSession;

    // Prevent re-submission
    if (session.status === 'submitted') {
        return NextResponse.json({ message: 'Assessment already submitted.', result: session.result }, { status: 200 });
    }

    // --- Load all necessary documents ---
    const assessmentRef = db.collection('assessments').doc(session.assessmentId);
    const assessmentDoc = await assessmentRef.get();
    if (!assessmentDoc.exists) {
        throw new Error(`Assessment configuration '${session.assessmentId}' not found.`);
    }
    const assessment = { ...assessmentDoc.data(), id: assessmentDoc.id } as Assessment;

    const templateRef = db.collection('assessment_templates').doc(assessment.templateId);
    const templateDoc = await templateRef.get();
    if (!templateDoc.exists) {
        throw new Error(`Assessment template '${assessment.templateId}' not found.`);
    }
    const template = { ...templateDoc.data(), id: templateDoc.id } as AssessmentTemplate;

    // --- GUARD CLAUSES FOR SCHEMA VALIDATION ---
    if (!template || !template.dimensions?.disc || !template.dimensions?.bigfive || !template.scale || !template.scoring) {
        console.error("Template loaded:", template.id, template);
        throw new Error(`Assessment template '${template.id}' is malformed or missing key properties like 'dimensions', 'scale', or 'scoring'.`);
    }
    if (!assessment || !assessment.resultTemplates?.disc || !assessment.resultTemplates?.bigfive || !assessment.rules) {
        console.error("Assessment loaded:", assessment.id, assessment);
        throw new Error(`Assessment '${assessment.id}' is malformed or missing key properties like 'resultTemplates' or 'rules'.`);
    }

    // Combine question IDs from both test parts
    const allQuestionIds = [
      ...(session.selectedQuestionIds?.likert || []),
      ...(session.selectedQuestionIds?.forcedChoice || []),
    ];

    if (allQuestionIds.length === 0) {
      throw new Error("No questions were selected for this assessment session.");
    }
    
    // Fetch only the selected questions
    const questionsQuery = db.collection('assessment_questions').where(admin.firestore.FieldPath.documentId(), 'in', allQuestionIds);
    const questionsSnap = await questionsQuery.get();
    const questions = questionsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as AssessmentQuestion));

    // --- 1. Scoring Engine ---
    const scores: AssessmentSession['scores'] = { disc: {}, bigfive: {} };

    // Initialize scores
    template.dimensions.disc.forEach(dim => scores.disc[dim.key] = 0);
    template.dimensions.bigfive.forEach(dim => scores.bigfive[dim.key] = 0);

    for (const question of questions) {
        const answer = session.answers[question.id!];
        if (answer === undefined) continue;

        if (question.type === 'likert') {
            let finalValue = answer as number;
            if (template.scoring.reverseEnabled && question.reverse) {
                finalValue = (template.scale.points + 1) - finalValue;
            }
            
            const scoreToAdd = finalValue * (question.weight || 1);

            if (question.engineKey === 'disc' && scores.disc[question.dimensionKey!] !== undefined) {
                scores.disc[question.dimensionKey!] += scoreToAdd;
            } else if (question.engineKey === 'bigfive' && scores.bigfive[question.dimensionKey!] !== undefined) {
                scores.bigfive[question.dimensionKey!] += scoreToAdd;
            }
        } else if (question.type === 'forced-choice') {
            const fcAnswer = answer as { most: string; least: string };
            if (!fcAnswer.most || !fcAnswer.least) continue;

            const mostStatement = question.forcedChoices?.find(c => c.text === fcAnswer.most);
            const leastStatement = question.forcedChoices?.find(c => c.text === fcAnswer.least);

            if (mostStatement) {
                if (mostStatement.engineKey === 'disc' && scores.disc[mostStatement.dimensionKey] !== undefined) {
                    scores.disc[mostStatement.dimensionKey]++;
                }
            }
            if (leastStatement) {
                 if (leastStatement.engineKey === 'disc' && scores.disc[leastStatement.dimensionKey] !== undefined) {
                    scores.disc[leastStatement.dimensionKey]--;
                }
            }
        }
    }
    
    // --- 2. Result Type Determination ---
    let discType = 'D'; // Fallback
    if (assessment.rules?.discRule === 'highest' && Object.keys(scores.disc).length > 0) {
        discType = Object.entries(scores.disc).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    }
    
    // --- 3. Normalization ---
    const normalized: AssessmentSession['normalized'] = { bigfive: {} };
    if (assessment.rules?.bigfiveNormalization === 'minmax') {
        const likertQuestions = questions.filter(q => q.type === 'likert');
        for (const dim of template.dimensions.bigfive) {
            const rawScore = scores.bigfive[dim.key];
            const minScore = getMinScore(likertQuestions, dim.key, 'bigfive');
            const maxScore = getMaxScore(likertQuestions, dim.key, 'bigfive', template.scale.points);
            if (maxScore - minScore === 0) {
                 normalized.bigfive[dim.key] = 50; // Avoid division by zero
            } else {
                 normalized.bigfive[dim.key] = Math.round(((rawScore - minScore) / (maxScore - minScore)) * 100);
            }
        }
    }
    
    // --- 4. Archetype Analysis (AI) ---
    let mbtiArchetype = null;
    try {
        const archetypeResult = await analyzePersonalityArchetype({
            discScores: scores.disc,
            bigFiveScores: normalized.bigfive,
        });
        mbtiArchetype = archetypeResult;
    } catch (aiError) {
        console.error("AI Archetype Analysis failed:", aiError);
        // We don't block submission if AI fails, just log it.
    }


    // --- 5. Report Generation ---
    const discReportTemplate = assessment.resultTemplates.disc[discType];
    if (!discReportTemplate) {
        throw new Error(`DISC result template for type "${discType}" not found.`);
    }

    const bigfiveSummary = template.dimensions.bigfive.map(dim => {
        const normalizedScore = normalized.bigfive[dim.key];
        const templates = assessment.resultTemplates.bigfive[dim.key];
        let text = templates?.midText; // Default to midText
        if (templates) {
          if (normalizedScore >= 66) text = templates.highText;
          else if (normalizedScore < 34) text = templates.lowText;
        }
        return { dimension: dim.label, score: normalizedScore, text };
    });
    
    const finalReport = {
      title: discReportTemplate.title || 'Hasil Tes Kepribadian',
      subtitle: discReportTemplate.subtitle || '',
      blocks: discReportTemplate.blocks || [],
      strengths: discReportTemplate.strengths || [],
      risks: discReportTemplate.risks || [],
      roleFit: discReportTemplate.roleFit || [],
      bigfiveSummary: bigfiveSummary,
      interviewQuestions: assessment.resultTemplates.overall?.interviewQuestions || []
    };
    
    const resultPayload: AssessmentSession['result'] = {
        discType,
        mbtiArchetype,
        report: finalReport
    };

    // --- 6. Denormalize candidate info ---
    const userDocRef = db.collection('users').doc(session.candidateUid);
    const userDoc = await userDocRef.get();
    const candidateName = userDoc.exists ? userDoc.data()?.fullName || null : null;
    const candidateEmail = userDoc.exists ? userDoc.data()?.email || null : null;
    
    // --- 7. Update Session Document ---
    await sessionRef.update({
        status: 'submitted',
        scores,
        normalized,
        result: resultPayload,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        candidateName,
        candidateEmail,
    });

    // --- 8. Update Application Status if linked ---
    if (session.applicationId) {
      const appRef = db.collection('applications').doc(session.applicationId);
      const appDoc = await appRef.get();
      // Check if application is in the personality test stage
      if (appDoc.exists && appDoc.data()?.status === 'tes_kepribadian') {
        await appRef.update({
          status: 'screening',
          updatedAt: Timestamp.now(),
        });
      }
    }

    return NextResponse.json({ message: 'Assessment submitted successfully.', result: resultPayload });

  } catch (error: any) {
    console.error('Error submitting assessment:', {
        sessionId,
        errorMessage: error.message,
        stack: error.stack,
    });
    return NextResponse.json({ error: 'Failed to process assessment results. ' + error.message }, { status: 500 });
  }
}
