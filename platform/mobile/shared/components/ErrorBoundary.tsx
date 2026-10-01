/**
 * ErrorBoundary Component
 * 
 * Global error boundary for catching and handling React component errors.
 * Provides a fallback UI when errors occur and reports them to logging services.
 * Uses semantic tokens for consistent theming.
 * 
 * Features:
 * - Catches JavaScript errors in child component tree
 * - Displays user-friendly fallback UI
 * - Reports errors to logging/analytics services
 * - Provides retry functionality
 * 
 * @module shared/components/ErrorBoundary
 */

import React, { Component, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { logger } from '../utils/logger';
import { captureException } from '../config/sentry';

// ============================================
// TYPES & INTERFACES
// ============================================

interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode;
  /** Optional custom fallback component */
  fallback?: ReactNode;
  /** Optional callback when error occurs */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Show error details in development mode */
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean;
  /** The caught error object */
  error: Error | null;
  /** Additional error information from React */
  errorInfo: React.ErrorInfo | null;
}

// ============================================
// SEMANTIC COLOR TOKENS (Static for Class Component)
// ============================================

const semanticColors = {
  light: {
    background: '#FFFFFF',
    foreground: '#1A1A1A',
    muted: '#F5F5F5',
    mutedForeground: '#666666',
    destructive: '#FF3B30',
    primary: '#FF6B35',
    primaryForeground: '#FFFFFF',
    card: '#333333',
  },
  dark: {
    background: '#1A1A1A',
    foreground: '#FFFFFF',
    muted: '#2D2D2D',
    mutedForeground: '#A0A0A0',
    destructive: '#FF453A',
    primary: '#FF7B45',
    primaryForeground: '#FFFFFF',
    card: '#666666',
  },
};

// ============================================
// ERROR BOUNDARY COMPONENT
// ============================================

/**
 * ErrorBoundary class component that catches JavaScript errors
 * anywhere in the child component tree and displays a fallback UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  /**
   * Static lifecycle method called when an error is thrown.
   * Updates state to trigger fallback UI rendering.
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  /**
   * Lifecycle method called after an error has been thrown.
   * Used for error logging and reporting.
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console and analytics
    logger.error('ErrorBoundary caught an error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Update state with error info
    this.setState({ errorInfo });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Report to Sentry for production error tracking
    captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  /**
   * Resets the error state, allowing retry of the failed component tree.
   */
  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  /**
   * Renders fallback UI when an error occurs.
   */
  renderFallback(): ReactNode {
    const { error, errorInfo } = this.state;
    const { fallback, showDetails = __DEV__ } = this.props;
    const colors = semanticColors.light; // Default to light theme

    // Use custom fallback if provided
    if (fallback) {
      return fallback;
    }

    // Default fallback UI with semantic tokens
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          {/* Error Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⚠️</Text>
          </View>

          {/* Error Title */}
          <Text style={[styles.title, { color: colors.foreground }]}>
            Ops! Algo deu errado
          </Text>

          {/* Error Description */}
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Sentimos muito, mas algo inesperado aconteceu. Tente novamente.
          </Text>

          {/* Error Details (Development Only) */}
          {showDetails && error && (
            <ScrollView style={[styles.detailsContainer, { backgroundColor: colors.muted }]}>
              <Text style={[styles.detailsTitle, { color: colors.destructive }]}>
                Detalhes do erro:
              </Text>
              <Text style={[styles.detailsText, { color: colors.card }]}>
                {error.message}
              </Text>
              {errorInfo?.componentStack && (
                <>
                  <Text style={[styles.detailsTitle, { color: colors.destructive }]}>
                    Pilha de componentes:
                  </Text>
                  <Text style={[styles.detailsText, { color: colors.card }]}>
                    {errorInfo.componentStack}
                  </Text>
                </>
              )}
            </ScrollView>
          )}

          {/* Retry Button */}
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={this.handleRetry}
          >
            <Text style={[styles.retryButtonText, { color: colors.primaryForeground }]}>
              Tentar novamente
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.renderFallback();
    }

    return this.props.children;
  }
}

// ============================================
// STYLES (Static styles without hardcoded colors)
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  iconContainer: {
    marginBottom: 24,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  detailsContainer: {
    maxHeight: 200,
    width: '100%',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailsText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  retryButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

// ============================================
// HIGHER-ORDER COMPONENT
// ============================================

/**
 * Higher-order component that wraps a component with ErrorBoundary.
 * 
 * @param WrappedComponent - Component to wrap with error boundary
 * @param errorBoundaryProps - Optional props for ErrorBoundary
 * @returns Wrapped component with error boundary protection
 * 
 * @example
 * const SafeMyComponent = withErrorBoundary(MyComponent);
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithErrorBoundary;
}

export default ErrorBoundary;
