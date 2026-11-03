import { useNetworkState } from 'expo-network';

/** True only when the OS reports no connection. Unknown (null) counts as online. */
export function useIsOffline(): boolean {
  const { isConnected, isInternetReachable } = useNetworkState();
  return isConnected === false || isInternetReachable === false;
}
