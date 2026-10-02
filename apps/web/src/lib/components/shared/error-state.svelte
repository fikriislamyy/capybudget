<script lang="ts">
  import * as Alert from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';

  let {
    title,
    message,
    retryLabel = '',
    onRetry
  }: {
    title: string;
    message: string;
    retryLabel?: string;
    onRetry?: () => void;
  } = $props();
</script>

<Alert.Root variant="destructive">
  <Alert.Title>{title}</Alert.Title>
  <Alert.Description>{message}</Alert.Description>
  {#if onRetry && retryLabel}<Alert.Action><Button variant="outline" size="sm" onclick={onRetry}>{retryLabel}</Button></Alert.Action>{/if}
</Alert.Root>
