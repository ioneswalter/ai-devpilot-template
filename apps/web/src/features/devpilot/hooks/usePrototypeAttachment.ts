/**
 * usePrototypeAttachment — fetches the prototype attached to a feature, if any.
 *
 * FR-089 v1.1 Journey C2 (consumer): the Spec Review modal uses this hook to
 * decide whether to render a prototype inline or fall back to the
 * "Run \generate-prototype" hint.
 *
 * Differs from usePrototype (which is keyed by conversation_id) — this is
 * keyed by feature_id and reads via the prototype_attachments junction.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import type { PrototypeType } from '@ownyourgig/types';

export interface PrototypeAttachmentState {
  content: string | null;
  prototypeType: PrototypeType | null;
  isLoading: boolean;
  hasAttachment: boolean;
}

export function usePrototypeAttachment(featureId: string | null): PrototypeAttachmentState {
  const query = useQuery<{ content: string; prototype_type: PrototypeType } | null>({
    queryKey: ['prototype-attachment', featureId],
    enabled: !!featureId,
    queryFn: async () => {
      if (!featureId) return null;
      const { data, error } = await supabase
        .from('prototype_attachments')
        .select('prototype_type, prototype_versions(content)')
        .eq('feature_id', featureId)
        .maybeSingle();
      if (error || !data) return null;
      const versions = data.prototype_versions as { content: string } | { content: string }[] | null;
      const content = Array.isArray(versions) ? versions[0]?.content ?? null : versions?.content ?? null;
      if (!content) return null;
      return { content, prototype_type: data.prototype_type as PrototypeType };
    },
    staleTime: 60_000,
  });

  return {
    content: query.data?.content ?? null,
    prototypeType: query.data?.prototype_type ?? null,
    isLoading: query.isLoading,
    hasAttachment: !!query.data?.content,
  };
}
