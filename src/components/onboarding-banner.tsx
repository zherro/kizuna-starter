'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@kizuna/core/client/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kizuna/core/client/components/ui/card';
import { cn } from '@kizuna/core/lib/utils';

/** Maps onboarding step slugs to their specific route inside the panel. */
const STEP_ROUTE_MAP: Record<string, string> = {
  'dados-pessoais': '/painel/minha-conta',
  'dados-usuario': '/painel/minha-conta',
  perfil: '/painel/minha-conta',
};

function stepRoute(step: OnboardingStep): string {
  return (
    STEP_ROUTE_MAP[step.slug] ??
    (step.stepOrder === 1 ? '/painel/minha-conta' : '/painel/onboarding')
  );
}

type OnboardingStep = {
  id: string;
  name: string;
  slug: string;
  description: string;
  stepOrder: number;
  isRequired: boolean;
};

type OnboardingProgress = {
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
};

type OnboardingBannerProps = {
  userId: string;
  role?: string;
};

export function OnboardingBanner({ userId, role = 'advertiser' }: OnboardingBannerProps) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [progress, setProgress] = useState<Record<string, OnboardingProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const stepsQuery = new URLSearchParams({
          page: '1',
          pageSize: '100',
          orderBy: 'step_order',
          orderDirection: 'asc',
          'filter.role': role,
          'filter.active': 'true',
        });

        const progressQuery = new URLSearchParams({
          page: '1',
          pageSize: '100',
          orderBy: 'created_at',
          orderDirection: 'asc',
          'filter.user_id': userId,
        });

        const [stepsRes, progressRes] = await Promise.all([
          fetch(`/api/resources/onboarding_steps?${stepsQuery.toString()}`),
          fetch(`/api/resources/onboarding_progress?${progressQuery.toString()}`),
        ]);

        if (stepsRes.ok) {
          const data = (await stepsRes.json().catch(() => null)) as {
            items?: OnboardingStep[];
          } | null;
          setSteps(data?.items ?? []);
        }

        if (progressRes.ok) {
          const data = (await progressRes.json().catch(() => null)) as {
            items?: Array<{ stepId: string; status: OnboardingProgress['status'] }>;
          } | null;
          const indexed = (data?.items ?? []).reduce(
            (acc, item) => {
              acc[item.stepId] = { status: item.status };
              return acc;
            },
            {} as Record<string, OnboardingProgress>
          );
          setProgress(indexed);
        }
      } catch (error) {
        console.error('[onboarding-banner]', error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [userId, role]);

  if (loading || steps.length === 0) {
    return null;
  }

  const completedCount = steps.filter((s) => progress[s.id]?.status === 'completed').length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);
  const isCompleted = progressPercent === 100;

  if (isCompleted) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Configure sua conta</CardTitle>
              <CardDescription className="mt-1">
                Complete {steps.length - completedCount} passo
                {steps.length - completedCount > 1 ? 's' : ''} para ativar todas as funcionalidades
                da plataforma.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {completedCount} de {steps.length} completo
            </span>
            <span className="text-sm font-semibold text-primary">{progressPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Quick Step List */}
        <div className="space-y-2">
          {steps.map((step) => {
            const stepProgress = progress[step.id];
            const isCompleted = stepProgress?.status === 'completed';
            const href = stepRoute(step);

            return (
              <Link
                key={step.id}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isCompleted
                    ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-current opacity-50" />
                )}
                <span className="flex-1 font-medium">{step.name}</span>
                {!isCompleted && <ChevronRight className="h-3.5 w-3.5 opacity-40" />}
              </Link>
            );
          })}
        </div>

        {/* Action Button */}
        <Button className="w-full">
          <Link href="/painel/onboarding">
            Ver todos os passos <ChevronRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
