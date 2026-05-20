pipeline {
    agent any

    environment {
        DOCKERHUB_USER          = 'poojannpandyaa'
        BACKEND_IMAGE           = "${DOCKERHUB_USER}/chatbot-backend"
        FRONTEND_IMAGE          = "${DOCKERHUB_USER}/chatbot-frontend"
        IMAGE_TAG               = "${BUILD_NUMBER}"
        NAMESPACE               = 'chatbot-prod'
        ANSIBLE_VAULT_PASS_FILE = credentials('ansible-vault-pass')
        PATH                    = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${env.PATH}"
    }

    triggers {
        githubPush()
    }

    stages {

        // ── 1. Source ────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // ── 2. Build (parallel) ──────────────────────────────────────────
        stage('Build Images') {
            parallel {
                stage('Backend') {
                    steps {
                        sh "docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend"
                    }
                }
                stage('Frontend') {
                    steps {
                        sh "docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} ./app"
                    }
                }
            }
        }

        // ── 3. Test ──────────────────────────────────────────────────────
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

        // ── 4. Security Scan ─────────────────────────────────────────────
        stage('Security Scan') {
            steps {
                sh '''#!/bin/bash
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

# BACKEND
echo "$DIV"
echo "  [1/2]  BACKEND  >>  ${BACKEND_IMAGE}:${IMAGE_TAG}"
echo "$DIV"
trivy image --exit-code 0 --severity HIGH,CRITICAL --no-progress --format table \
    ${BACKEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/be_full.txt
grep -E "^[|]" /tmp/be_full.txt | grep -E "(HIGH|CRITICAL)" > /tmp/be_cves.txt || true
B_CRIT=$(count_severity /tmp/be_cves.txt CRITICAL)
B_HIGH=$(count_severity /tmp/be_cves.txt HIGH)
if [ -s /tmp/be_cves.txt ]; then
    printf "  %-22s  %-10s  %-18s  %-13s  %s\n" "CVE-ID" "SEVERITY" "PACKAGE" "INSTALLED" "FIXED"
    while IFS= read -r line; do
        printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
            "$(echo $line|awk -F\'|\' \'{print $2}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $3}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $1}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $5}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $6}\'|xargs)"
    done < /tmp/be_cves.txt
else
    echo "  >> Clean: No HIGH/CRITICAL vulnerabilities found."
fi
echo "  BACKEND  -->  CRITICAL: ${B_CRIT}   HIGH: ${B_HIGH}"
echo ""

# FRONTEND
echo "$DIV"
echo "  [2/2]  FRONTEND  >>  ${FRONTEND_IMAGE}:${IMAGE_TAG}"
echo "$DIV"
trivy image --exit-code 0 --severity HIGH,CRITICAL --no-progress --format table \
    ${FRONTEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/fe_full.txt
grep -E "^[|]" /tmp/fe_full.txt | grep -E "(HIGH|CRITICAL)" > /tmp/fe_cves.txt || true
F_CRIT=$(count_severity /tmp/fe_cves.txt CRITICAL)
F_HIGH=$(count_severity /tmp/fe_cves.txt HIGH)
if [ -s /tmp/fe_cves.txt ]; then
    printf "  %-22s  %-10s  %-18s  %-13s  %s\n" "CVE-ID" "SEVERITY" "PACKAGE" "INSTALLED" "FIXED"
    head -30 /tmp/fe_cves.txt | while IFS= read -r line; do
        printf "  %-22s  %-10s  %-18s  %-13s  %s\n" \
            "$(echo $line|awk -F\'|\' \'{print $2}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $3}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $1}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $5}\'|xargs)" \
            "$(echo $line|awk -F\'|\' \'{print $6}\'|xargs)"
    done
else
    echo "  >> Clean: No HIGH/CRITICAL vulnerabilities found."
fi
echo "  FRONTEND  -->  CRITICAL: ${F_CRIT}   HIGH: ${F_HIGH}"
echo ""

# SUMMARY
TOT_CRIT=$((B_CRIT + F_CRIT))
TOT_HIGH=$((B_HIGH + F_HIGH))
echo "$SEP"
printf "  %-14s  %10s  %8s\n" "IMAGE" "CRITICAL" "HIGH"
printf "  %-14s  %10s  %8s\n" "backend"  "$B_CRIT" "$B_HIGH"
printf "  %-14s  %10s  %8s\n" "frontend" "$F_CRIT" "$F_HIGH"
printf "  %-14s  %10s  %8s\n" "TOTAL"    "$TOT_CRIT" "$TOT_HIGH"
echo ""
if [ "$TOT_CRIT" -gt 0 ]; then
    echo "  STATUS >> FAILED: ${TOT_CRIT} CRITICAL CVE(s). Blocking deployment."
    exit 1
else
    echo "  STATUS >> PASSED: No CRITICAL vulnerabilities."
fi
echo "$SEP"
                '''
            }
        }

        // ── 5. Push ──────────────────────────────────────────────────────
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
                        docker tag  ${BACKEND_IMAGE}:${IMAGE_TAG}  ${BACKEND_IMAGE}:latest
                        docker tag  ${FRONTEND_IMAGE}:${IMAGE_TAG} ${FRONTEND_IMAGE}:latest
                        docker push ${BACKEND_IMAGE}:latest
                        docker push ${FRONTEND_IMAGE}:latest
                    '''
                }
            }
        }

        // ── 6. Deploy ────────────────────────────────────────────────────
        stage('Deploy') {
            steps {
                sh '''
                    # Ensure Minikube is running before deploy
                    minikube status | grep -q "Running" || minikube start --driver=docker
                '''
                sh '''
                    ansible-playbook ansible/site.yml \
                        --vault-password-file ${ANSIBLE_VAULT_PASS_FILE} \
                        -e "backend_image=${BACKEND_IMAGE}:${IMAGE_TAG}" \
                        -e "frontend_image=${FRONTEND_IMAGE}:${IMAGE_TAG}" \
                        -i ansible/inventory/hosts.ini
                '''
            }
        }

        // ── 7. Health Check ──────────────────────────────────────────────
        stage('Health Check') {
            steps {
                sh '''
                    echo "Waiting for rollout to complete..."
                    kubectl rollout status deployment/chatbot-backend  -n ${NAMESPACE} --timeout=120s
                    kubectl rollout status deployment/chatbot-frontend -n ${NAMESPACE} --timeout=120s
                    echo ""
                    echo "--- Pod Status ---"
                    kubectl get pods -n ${NAMESPACE}
                    echo ""
                    echo "--- Vault Status ---"
                    kubectl get pods -n vault
                '''
            }
        }
    }

    post {
        always {
            sh 'docker image prune -f || true'
        }
        success {
            sh '''#!/bin/bash
                set +e

                # Start observability stack
                echo "Starting observability stack..."
                cd ${WORKSPACE}
                docker-compose up -d elasticsearch kibana logstash prometheus grafana redis-exporter 2>/dev/null || true
                sleep 5

                # Kill stale port-forwards
                pkill -f "kubectl port-forward.*chatbot-service"  2>/dev/null || true
                pkill -f "kubectl port-forward.*frontend-service" 2>/dev/null || true
                pkill -f "kubectl port-forward.*vault"            2>/dev/null || true
                sleep 1

                # Start port-forwards
                nohup kubectl port-forward service/frontend-service 3000:80   -n ${NAMESPACE} > /tmp/pf-frontend.log 2>&1 &
                nohup kubectl port-forward service/chatbot-service  8000:80   -n ${NAMESPACE} > /tmp/pf-backend.log  2>&1 &
                nohup kubectl port-forward service/vault            8200:8200 -n vault        > /tmp/pf-vault.log    2>&1 &
                sleep 3

                echo ""
                echo "========================================================"
                echo "  DEPLOYMENT SUCCESSFUL  --  Build #${BUILD_NUMBER}"
                echo "========================================================"
                echo "  Chatbot UI   :  http://localhost:3000"
                echo "  Backend API  :  http://localhost:8000/docs"
                echo "  Kibana       :  http://localhost:5601"
                echo "  Grafana      :  http://localhost:3001"
                echo "  Prometheus   :  http://localhost:9090"
                echo "  Vault UI     :  http://localhost:8200"
                echo "========================================================"
                echo "  To stop port-forwards: pkill -f 'kubectl port-forward'"
                echo "========================================================"
            '''
        }
        failure {
            echo 'Pipeline failed. Check stage logs above.'
        }
    }
}
