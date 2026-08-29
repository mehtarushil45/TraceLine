import React, { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

/**
 * Legacy route redirect handler.
 * Deep links to /communities/:communityId/investigate are redirected to
 * the canonical top-level Forensic Workspace at /forensics?community=:id&view=:view.
 */
export const CommunityInvestigationPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!communityId) {
      navigate('/forensics', { replace: true });
      return;
    }
    const view = searchParams.get('view') || 'evidence';
    const focus = searchParams.get('focus');
    const params = new URLSearchParams();
    params.set('community', communityId);
    params.set('view', view);
    if (focus) params.set('focus', focus);
    navigate(`/forensics?${params.toString()}`, { replace: true });
  }, [communityId, searchParams, navigate]);

  return null;
};
