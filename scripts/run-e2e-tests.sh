#!/bin/bash

# X-Yield Mobile E2E Test Runner
# Runs Maestro E2E tests for the React Native app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_ID="com.xyield.mobile"
MAESTRO_DIR=".maestro"
FLOWS_DIR="$MAESTRO_DIR/flows"

# Print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Maestro is installed
check_maestro() {
    if ! command -v maestro &> /dev/null; then
        print_error "Maestro CLI is not installed!"
        echo ""
        echo "Install Maestro with one of these methods:"
        echo ""
        echo "  # macOS/Linux (Homebrew)"
        echo "  brew install maestro"
        echo ""
        echo "  # macOS/Linux (curl)"
        echo "  curl -Ls \"https://get.maestro.mobile.dev\" | bash"
        echo ""
        echo "  # Windows (PowerShell)"
        echo "  iwr -useb https://get.maestro.mobile.dev | iex"
        echo ""
        echo "After installation, run: maestro --version"
        exit 1
    fi
    print_success "Maestro CLI found: $(maestro --version)"
}

# Check if iOS Simulator is running
check_simulator() {
    if ! xcrun simctl list devices | grep -q "(Booted)"; then
        print_warning "No iOS simulator is booted."
        echo ""
        echo "Start a simulator with:"
        echo "  open -a Simulator"
        echo ""
        echo "Or boot a specific device:"
        echo "  xcrun simctl boot 'iPhone 17 Pro'"
        exit 1
    fi
    print_success "iOS Simulator is running"
}

# Check if app is installed
check_app_installed() {
    local booted_device=$(xcrun simctl list devices | grep "(Booted)" | head -1 | sed 's/.*(\(.*\)) (Booted).*/\1/')
    if xcrun simctl get_app_container "$booted_device" "$APP_ID" &> /dev/null; then
        print_success "App is installed on simulator"
    else
        print_warning "App may not be installed. Run 'npx expo run:ios' first."
    fi
}

# Run all tests
run_all_tests() {
    print_info "Running ALL E2E tests..."
    echo ""

    maestro test "$FLOWS_DIR" --format junit --output test-results/e2e-results.xml

    print_success "All tests completed!"
}

# Run smoke tests only
run_smoke_tests() {
    print_info "Running SMOKE tests (quick sanity check)..."
    echo ""

    maestro test "$FLOWS_DIR/login.yaml" "$FLOWS_DIR/logout.yaml" \
        --format junit --output test-results/smoke-results.xml

    print_success "Smoke tests completed!"
}

# Run critical path tests
run_critical_tests() {
    print_info "Running CRITICAL path tests..."
    echo ""

    maestro test \
        "$FLOWS_DIR/login.yaml" \
        "$FLOWS_DIR/deposit.yaml" \
        "$FLOWS_DIR/withdraw.yaml" \
        --format junit --output test-results/critical-results.xml

    print_success "Critical tests completed!"
}

# Run a single test flow
run_single_test() {
    local flow_name=$1
    local flow_path="$FLOWS_DIR/${flow_name}.yaml"

    if [ ! -f "$flow_path" ]; then
        print_error "Test flow not found: $flow_path"
        echo ""
        echo "Available flows:"
        ls -1 "$FLOWS_DIR"/*.yaml 2>/dev/null | xargs -n1 basename | sed 's/.yaml$//'
        exit 1
    fi

    print_info "Running test: $flow_name"
    echo ""

    maestro test "$flow_path"

    print_success "Test completed: $flow_name"
}

# Run tests in Maestro Studio (interactive mode)
run_studio() {
    print_info "Opening Maestro Studio for interactive testing..."
    maestro studio
}

# Show usage
show_usage() {
    echo "X-Yield Mobile E2E Test Runner"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  all           Run all E2E tests"
    echo "  smoke         Run smoke tests (login + logout)"
    echo "  critical      Run critical path tests (login, deposit, withdraw)"
    echo "  single <name> Run a single test flow (e.g., 'login', 'deposit')"
    echo "  studio        Open Maestro Studio for interactive testing"
    echo "  check         Check prerequisites (Maestro, simulator, app)"
    echo "  help          Show this help message"
    echo ""
    echo "Available test flows:"
    if [ -d "$FLOWS_DIR" ]; then
        ls -1 "$FLOWS_DIR"/*.yaml 2>/dev/null | xargs -n1 basename | sed 's/.yaml$//' | sed 's/^/  - /'
    fi
    echo ""
    echo "Examples:"
    echo "  $0 all              # Run all tests"
    echo "  $0 smoke            # Quick sanity check"
    echo "  $0 single login     # Run only login test"
    echo "  $0 studio           # Interactive testing"
}

# Create test results directory
mkdir -p test-results

# Main script logic
case "${1:-help}" in
    all)
        check_maestro
        check_simulator
        check_app_installed
        run_all_tests
        ;;
    smoke)
        check_maestro
        check_simulator
        check_app_installed
        run_smoke_tests
        ;;
    critical)
        check_maestro
        check_simulator
        check_app_installed
        run_critical_tests
        ;;
    single)
        if [ -z "$2" ]; then
            print_error "Please specify a test flow name"
            echo ""
            echo "Available flows:"
            ls -1 "$FLOWS_DIR"/*.yaml 2>/dev/null | xargs -n1 basename | sed 's/.yaml$//' | sed 's/^/  - /'
            exit 1
        fi
        check_maestro
        check_simulator
        check_app_installed
        run_single_test "$2"
        ;;
    studio)
        check_maestro
        check_simulator
        run_studio
        ;;
    check)
        check_maestro
        check_simulator
        check_app_installed
        print_success "All prerequisites met!"
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac
