import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  TextInput,
  Text,
  View,
  Platform,
  Alert,
  AppState,
} from 'react-native';
import NfcManager, { NfcTech, NfcEvents, TagEvent } from 'react-native-nfc-manager';
import io from 'socket.io-client';

// Server configuration
const SERVER_CONFIG = {
  development: 'http://192.168.117.178:3000',
  production: 'https://your-project-name.glitch.me' // Replace with your Glitch project URL when ready
};

const SERVER_URL = __DEV__ ? SERVER_CONFIG.development : SERVER_CONFIG.production;

// Initialize socket connection with enhanced configuration
const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: false,
  forceNew: true,
  multiplex: false,
  upgrade: true,
  rememberUpgrade: true,
  secure: !__DEV__,
  rejectUnauthorized: !__DEV__,
  withCredentials: true,
  extraHeaders: {
    'User-Agent': 'NFCReaderApp/1.0.0'
  }
});

// Ensure NFC Manager is initialized only once
let isNfcInitialized = false;

function App(): JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const [hasNFC, setHasNFC] = useState(false);
  const [nfcStatus, setNfcStatus] = useState('Starting...');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [latency, setLatency] = useState<number | null>(null);

  // Function to check connection latency
  const checkLatency = useCallback(() => {
    if (socket.connected) {
      const start = Date.now();
      socket.emit('ping', (response: any) => {
        const duration = Date.now() - start;
        setLatency(duration);
        console.log('Current latency:', duration, 'ms');
      });
    }
  }, []);

  useEffect(() => {
    // Set up periodic latency checking
    const latencyInterval = setInterval(checkLatency, 10000);
    return () => clearInterval(latencyInterval);
  }, [checkLatency]);

  useEffect(() => {
    let mounted = true;

    const initNfc = async () => {
      if (isNfcInitialized) {
        console.log('NFC already initialized, skipping...');
        return;
      }

      try {
        // Check if NFC is supported
        console.log('Checking NFC support...');
        const supported = await NfcManager.isSupported();
        console.log('NFC supported:', supported);

        if (!supported) {
          setNfcStatus('NFC is not supported on this device');
          return;
        }

        // Start NFC
        console.log('Starting NFC...');
        await NfcManager.start();
        isNfcInitialized = true;

        if (mounted) {
          setHasNFC(true);
          setNfcStatus('NFC Ready - Waiting for tag');

          // For Android, start listening for tags
          if (Platform.OS === 'android') {
            try {
              console.log('Registering Android tag event...');
              await NfcManager.registerTagEvent();

              // Set up tag discovery listener
              NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
                console.log('Tag discovered:', tag);
                try {
                  if (tag?.ndefMessage && tag.ndefMessage.length > 0) {
                    const ndefRecord = tag.ndefMessage[0];
                    const payload = ndefRecord.payload;
                    if (payload) {
                      // Skip first 3 bytes (encoding bytes) and convert to text
                      const text = String.fromCharCode.apply(null, payload.slice(3));
                      setInputValue(text);
                      setNfcStatus('Tag read successfully!');

                      // Send the tag data to the server
                      socket.emit('nfcData', {
                        timestamp: new Date().toISOString(),
                        tagData: tag.ndefMessage
                      });
                    }
                  }
                } catch (tagError) {
                  console.warn('Error processing tag:', tagError);
                  setNfcStatus('Error reading tag data');
                }
              });
            } catch (androidError) {
              console.warn('Android NFC setup error:', androidError);
              setNfcStatus('Error setting up NFC reader');
            }
          }
        }
      } catch (error: any) {
        console.warn('NFC Init Error:', error);
        if (mounted) {
          const errorMessage = error?.message || 'Unknown error occurred';
          setNfcStatus(`NFC Error: ${errorMessage}`);
          setHasNFC(false);
          Alert.alert(
            'NFC Error',
            `Failed to initialize NFC: ${errorMessage}\n\nPlease make sure NFC is enabled in your device settings.`,
            [{ text: 'OK' }]
          );
        }
      }
    };

    const setupSocket = () => {
      if (!socket.connected) {
        console.log('Connecting to server:', SERVER_URL);
        socket.connect();
      }

      socket.on('connect', () => {
        setIsConnected(true);
        setConnectionStatus('Connected');
        setLastError(null);
        console.log('Socket connected:', socket.id);
        checkLatency(); // Check initial latency
      });

      socket.on('connection_ack', (data) => {
        console.log('Connection acknowledged by server:', data);
        setServerInfo(data.serverInfo);
      });

      socket.on('connect_error', (error) => {
        const errorMsg = `Connection error: ${error.message}`;
        setConnectionStatus(errorMsg);
        setLastError(errorMsg);
        console.error('Connection error:', error);
        
        // Try to reconnect with a different transport
        if (socket.io.opts.transports.includes('websocket')) {
          console.log('Retrying with polling transport...');
          socket.io.opts.transports = ['polling'];
        } else {
          console.log('Retrying with websocket transport...');
          socket.io.opts.transports = ['websocket', 'polling'];
        }
      });

      socket.on('disconnect', (reason) => {
        setIsConnected(false);
        setConnectionStatus(`Disconnected: ${reason}`);
        setLatency(null);
        console.log('Socket disconnected:', reason);
        
        if (reason === 'io server disconnect' || reason === 'transport close') {
          setTimeout(() => {
            console.log('Attempting to reconnect...');
            socket.connect();
          }, 1000);
        }
      });

      socket.on('reconnect_attempt', (attemptNumber) => {
        setConnectionStatus(`Reconnecting... (Attempt ${attemptNumber})`);
        console.log('Reconnection attempt:', attemptNumber);
      });

      socket.on('nfcDataAck', (ack) => {
        console.log('Server acknowledged NFC data:', ack);
      });

      // Handle app state changes
      const handleAppStateChange = (nextAppState: string) => {
        console.log('App state changed to:', nextAppState);
        if (nextAppState === 'active') {
          if (!socket.connected) {
            console.log('App became active, reconnecting socket...');
            socket.connect();
          }
          checkLatency(); // Check latency when app becomes active
        }
      };

      const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

      // Cleanup function
      return () => {
        socket.off('connect');
        socket.off('connection_ack');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('reconnect_attempt');
        socket.off('nfcDataAck');
        appStateSubscription.remove();
        socket.disconnect();
        if (isNfcInitialized) {
          NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
          NfcManager.unregisterTagEvent().catch(() => {});
        }
      };
    };

    initNfc();
    setupSocket();

    return () => {
      mounted = false;
    };
  }, [checkLatency]); // Empty dependency array means this runs once on mount

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>NFC Reader</Text>
        <Text style={[styles.status, isConnected ? styles.connected : styles.disconnected]}>
          {connectionStatus}
        </Text>
        <Text style={styles.nfcStatus}>{nfcStatus}</Text>
        {serverInfo && (
          <Text style={styles.serverInfo}>
            Server: {serverInfo.name} ({serverInfo.version})
          </Text>
        )}
        {latency !== null && (
          <Text style={styles.latency}>
            Latency: {latency} ms
          </Text>
        )}
      </View>
      <View style={styles.content}>
        <TextInput
          style={styles.input}
          value={inputValue}
          placeholder="NFC data will appear here..."
          editable={false}
          multiline
        />
        <Text style={styles.instructions}>
          {hasNFC 
            ? 'Hold your device near an NFC tag'
            : Platform.select({
                android: 'Please enable NFC in your device settings:\nSettings > Connected devices > Connection preferences > NFC',
                ios: 'Please make sure NFC is enabled in your device settings',
                default: 'Please enable NFC in your device settings'
              })
          }
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  input: {
    width: '100%',
    minHeight: 50,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    marginBottom: 20,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  instructions: {
    textAlign: 'center',
    color: '#666',
    marginTop: 20,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  warning: {
    color: '#E74C3C',
  },
  status: {
    fontSize: 16,
    marginBottom: 20,
    color: '#2ECC71',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  connected: {
    color: '#2ECC71',
  },
  disconnected: {
    color: '#E74C3C',
  },
  nfcStatus: {
    fontSize: 16,
    marginBottom: 20,
    color: '#2ECC71',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  serverInfo: {
    fontSize: 14,
    marginBottom: 10,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  latency: {
    fontSize: 14,
    marginBottom: 10,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default App;
