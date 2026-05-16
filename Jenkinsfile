pipeline {
    agent any

    environment {
        DOCKERHUB_USER          = 'poojannpandyaa'
        BACKEND_IMAGE           = "${DOCKERHUB_USER}/chatbot-backend"
        FRONTEND_IMAGE          = "${DOCKERHUB_USER}/chatbot-frontend"
        IMAGE_TAG               = "${BUILD_NUMBER}"
        NAMESPACE               = "chatbot-prod"
        ANSIBLE_VAULT_PASS_FILE = credentials('ansible-vault-pass')
        PATH                    = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${env.PATH}"
    }

    triggers {
        githubPush()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('System Prep') {
            steps {
                sh 'ansible-playbook ansible/prep.yml --vault-password-file ${ANSIBLE_VAULT_PASS_FILE}'
            }
        }

        stage('Build Backend Image') {
            steps {
                sh "docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend"
            }
        }

        stage('Build Frontend Image') {
            steps {
                sh "docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} ./app"
            }
        }

        stage('Run Tests') {
            steps {
                sh '''#!/bin/bash
                    set +e
                    cd backend
                    python3 -m venv .venv
                    source .venv/bin/activate
                    pip install -q -r requirements.txt
                    python -m pytest tests/ -v --tb=short
                    TEST_EXIT=$?
                    deactivate
                    exit $TEST_EXIT
                '''
            }
        }

        stage('Security Scan') {
            steps {
                sh '''
#!/bin/bash
SEP="########################################################################"
DIV="------------------------------------------------------------------------"

count_severity() {
    local file="$1" sev="$2"
    local n
    n=$(grep -c "$sev" "$file" 2>/dev/null) || n=0
    printf '%s' "$n"
}

echo ""
echo "$SEP"
echo "#                                                                      #"
echo "#           TRIVY CONTAINER SECURITY SCAN REPORT                      #"
echo "#           Build: ${BUILD_NUMBER}                                    #"
echo "#                                                                      #"
echo "$SEP"
echo ""

# ===========================================================================
# BACKEND SCAN
# ===========================================================================
echo "$DIV"
echo "  [1/2]  BACKEND IMAGE  >>  ${BACKEND_IMAGE}:${IMAGE_TAG}"
echo "$DIV"

trivy image \
    --exit-code 0 \
    --severity HIGH,CRITICAL \
    --no-progress \
    --format table \
    ${BACKEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/be_full.txt

grep -E "^[|]" /tmp/be_full.txt | grep -E "(HIGH|CRITICAL)" > /tmp/be_cves.txt || true

B_CRIT=$(count_severity /tmp/be_cves.txt CRITICAL)
B_HIGH=$(count_severity /tmp/be_cves.txt HIGH)

if [ -s /tmp/be_cves.txt ]; then
    echo ""
    printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
           "CVE-ID" "SEVERITY" "PACKAGE" "INSTALLED" "FIXED"
    printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
           "----------------------" "----------" "------------------" "-------------" "-----------"
    while IFS= read -r line; do
        CVE=$(  echo "$line" | awk -F"|" "{print \$2}" | xargs 2>/dev/null)
        SEV=$(  echo "$line" | awk -F"|" "{print \$3}" | xargs 2>/dev/null)
        PKG=$(  echo "$line" | awk -F"|" "{print \$1}" | xargs 2>/dev/null)
        INST=$( echo "$line" | awk -F"|" "{print \$5}" | xargs 2>/dev/null)
        FIXED=$(echo "$line" | awk -F"|" "{print \$6}" | xargs 2>/dev/null)
        printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
               "$CVE" "$SEV" "$PKG" "$INST" "$FIXED"
    done < /tmp/be_cves.txt
else
    echo ""
    echo "  >> Clean: No HIGH/CRITICAL vulnerabilities found."
fi

echo ""
echo "  BACKEND   -->  CRITICAL: ${B_CRIT}   HIGH: ${B_HIGH}"
echo ""

# ===========================================================================
# FRONTEND SCAN
# ===========================================================================
echo "$DIV"
echo "  [2/2]  FRONTEND IMAGE  >>  ${FRONTEND_IMAGE}:${IMAGE_TAG}"
echo "$DIV"

trivy image \
    --exit-code 0 \
    --severity HIGH,CRITICAL \
    --no-progress \
    --format table \
    ${FRONTEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/fe_full.txt

grep -E "^[|]" /tmp/fe_full.txt | grep -E "(HIGH|CRITICAL)" > /tmp/fe_cves.txt || true

F_CRIT=$(count_severity /tmp/fe_cves.txt CRITICAL)
F_HIGH=$(count_severity /tmp/fe_cves.txt HIGH)

if [ -s /tmp/fe_cves.txt ]; then
    echo ""
    printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
           "CVE-ID" "SEVERITY" "PACKAGE" "INSTALLED" "FIXED"
    printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
           "----------------------" "----------" "------------------" "-------------" "-----------"
    head -30 /tmp/fe_cves.txt | while IFS= read -r line; do
        CVE=$(  echo "$line" | awk -F"|" "{print \$2}" | xargs 2>/dev/null)
        SEV=$(  echo "$line" | awk -F"|" "{print \$3}" | xargs 2>/dev/null)
        PKG=$(  echo "$line" | awk -F"|" "{print \$1}" | xargs 2>/dev/null)
        INST=$( echo "$line" | awk -F"|" "{print \$5}" | xargs 2>/dev/null)
        FIXED=$(echo "$line" | awk -F"|" "{print \$6}" | xargs 2>/dev/null)
        printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
               "$CVE" "$SEV" "$PKG" "$INST" "$FIXED"
    done
    TOTAL_FE=$(wc -l < /tmp/fe_cves.txt | tr -d " ")
    if [ "$TOTAL_FE" -gt 30 ]; then
        echo "  ... ($((TOTAL_FE - 30)) more entries -- run trivy locally for full report)"
    fi
else
    echo ""
    echo "  >> Clean: No HIGH/CRITICAL vulnerabilities found."
fi

echo ""
echo "  FRONTEND  -->  CRITICAL: ${F_CRIT}   HIGH: ${F_HIGH}"
echo ""

# ===========================================================================
# SUMMARY TABLE
# ===========================================================================
TOT_CRIT=$((B_CRIT + F_CRIT))
TOT_HIGH=$((B_HIGH + F_HIGH))
TOTAL=$((TOT_CRIT + TOT_HIGH))

echo "$SEP"
echo "#                     FINAL SUMMARY                                   #"
echo "$SEP"
echo ""
printf "  %-14s  %10s  %8s  %8s\n" "IMAGE"    "CRITICAL" "HIGH"  "TOTAL"
printf "  %-14s  %10s  %8s  %8s\n" "--------------" "----------" "--------" "--------"
printf "  %-14s  %10s  %8s  %8s\n" "backend"  "$B_CRIT"  "$B_HIGH" "$((B_CRIT + B_HIGH))"
printf "  %-14s  %10s  %8s  %8s\n" "frontend" "$F_CRIT"  "$F_HIGH" "$((F_CRIT + F_HIGH))"
printf "  %-14s  %10s  %8s  %8s\n" "--------------" "----------" "--------" "--------"
printf "  %-14s  %10s  %8s  %8s\n" "TOTAL"    "$TOT_CRIT" "$TOT_HIGH" "$TOTAL"
echo ""

if [ "$TOT_CRIT" -gt 0 ]; then
    echo "  STATUS >>  FAILED: ${TOT_CRIT} CRITICAL CVE(s) detected. Blocking deployment."
    exit 1
else
    echo "  STATUS >>  PASSED : No CRITICAL vulnerabilities. Safe to continue."
fi
echo ""
echo "$SEP"
echo ""
                '''
            }
        }

        stage('Push Images') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker tag ${BACKEND_IMAGE}:${IMAGE_TAG} ${BACKEND_IMAGE}:latest
                        docker tag ${FRONTEND_IMAGE}:${IMAGE_TAG} ${FRONTEND_IMAGE}:latest
                        docker push ${BACKEND_IMAGE}:latest
                        docker push ${FRONTEND_IMAGE}:latest
                    '''
                }
            }
        }

        stage('Deploy via Ansible') {
            steps {
                sh '''
                    ansible-playbook ansible/site.yml \
                        --vault-password-file ${ANSIBLE_VAULT_PASS_FILE} \
                        -e "backend_image=${BACKEND_IMAGE}:${IMAGE_TAG}" \
                        -e "frontend_image=${FRONTEND_IMAGE}:${IMAGE_TAG}" \
                        -i ansible/inventory/hosts.ini
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    sleep 15
                    kubectl get pods -n ${NAMESPACE}
                '''
            }
        }

        stage('Validate ELK') {
            steps {
                sh '''
                    echo "Validating ELK Log Push (Placeholder)"
                    curl -s http://logstash-service:5044 || true
                '''
            }
        }
    }

    post {
        always {
            sh 'docker image prune -f || true'
        }
        success {
            echo 'Pipeline completed successfully.'
            sh '''#!/bin/bash
                set +e

                # ── 1. Start Observability Stack (ELK + Grafana) ──────────
                echo "▶ Starting observability stack via docker-compose..."
                cd ${WORKSPACE}
                docker-compose up -d elasticsearch kibana logstash prometheus grafana redis-exporter 2>/dev/null || true
                sleep 5

                # ── 2. Set up port-forwards for K8s services ──────────────
                echo "▶ Setting up port-forwards for K8s services..."

                # Kill any stale port-forwards
                pkill -f "kubectl port-forward.*chatbot-service" 2>/dev/null || true
                pkill -f "kubectl port-forward.*frontend-service" 2>/dev/null || true
                sleep 1

                # Start fresh port-forwards (background, survive pipeline exit)
                nohup kubectl port-forward service/frontend-service 3000:80 -n ${NAMESPACE} > /tmp/pf-frontend.log 2>&1 &
                nohup kubectl port-forward service/chatbot-service 8000:80 -n ${NAMESPACE} > /tmp/pf-backend.log 2>&1 &
                sleep 3

                # ── 3. Verify and Print URLs ──────────────────────────────
                echo ""
                echo "========================================================"
                echo "🚀 DEPLOYMENT SUCCESSFUL!"
                echo "========================================================"
                echo ""
                echo "  🌐 Chatbot UI:        http://localhost:3000"
                echo "  ⚙️  Backend API:       http://localhost:8000/docs"
                echo "  📊 Kibana (Logs):      http://localhost:5601"
                echo "  📈 Grafana (Metrics):  http://localhost:3001"
                echo "  🔍 Prometheus:         http://localhost:9090"
                echo "  🔐 Vault UI:           http://localhost:8200"
                echo ""
                echo "========================================================"
                echo "  All port-forwards are running in the background."
                echo "  To stop them:  pkill -f 'kubectl port-forward'"
                echo "========================================================"
            '''
        }
        failure {
            echo 'Pipeline failed. Check logs above.'
        }
    }
}
