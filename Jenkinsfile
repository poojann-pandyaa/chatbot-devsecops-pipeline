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

                    # Ensure Nginx Ingress controller addon is active
                    minikube addons enable ingress      2>/dev/null || true
                    minikube addons enable ingress-dns  2>/dev/null || true
                '''
                sh '''
                    ansible-playbook ansible/site.yml \
                        --vault-password-file ${ANSIBLE_VAULT_PASS_FILE} \
                        -e "backend_image=${BACKEND_IMAGE}:${IMAGE_TAG}" \
                        -e "frontend_image=${FRONTEND_IMAGE}:${IMAGE_TAG}" \
                        -i ansible/inventory/hosts.ini
                '''
                sh '''
                    # Apply Ingress resources and updated Prometheus (not managed by Ansible role)
                    kubectl apply -f k8s/ingress.yaml
                    kubectl apply -f k8s/monitoring-ingress.yaml
                    kubectl apply -f k8s/prometheus/statefulset.yaml
                    kubectl apply -f k8s/grafana/deployment.yaml
                    echo "Ingress + Prometheus + Grafana resources applied."
                    kubectl get ingress -A
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

                # ── ELK Stack (runs via Docker Compose on host) ───────────────
                echo "Starting ELK observability stack..."
                cd ${WORKSPACE}
                docker-compose up -d elasticsearch kibana logstash 2>/dev/null || true

                # Stop any Docker Compose app containers that conflict with K8s
                docker stop chatbot-frontend chatbot-backend vault 2>/dev/null || true

                # ── Kill ALL stale port-forwards (no longer needed) ───────────
                pkill -f "kubectl port-forward" 2>/dev/null || true
                sleep 2

                # ── Ensure minikube tunnel is running (Ingress → 127.0.0.1) ──
                # NOTE: minikube tunnel needs sudo for port 80 and must run in
                # an interactive terminal. Jenkins cannot provide the sudo prompt.
                # The user must run it manually — see the URL summary below.
                # If already running, the existing tunnel is kept.
                if pgrep -f "minikube tunnel" > /dev/null 2>&1; then
                    echo "  minikube tunnel: already running (OK)"
                else
                    echo "  minikube tunnel: NOT running — user must start it manually"
                fi

                # ── Add chatbot.local to /etc/hosts if missing ────────────────
                MINIKUBE_IP=$(minikube ip 2>/dev/null || echo "127.0.0.1")
                if ! grep -q "chatbot.local" /etc/hosts 2>/dev/null; then
                    echo "127.0.0.1  chatbot.local" | sudo tee -a /etc/hosts > /dev/null
                    echo "Added chatbot.local → 127.0.0.1 to /etc/hosts"
                else
                    echo "chatbot.local already in /etc/hosts"
                fi

                # ── Wait for Ingress controller to assign an IP ───────────────
                echo "Waiting for Ingress controller to become ready..."
                for i in $(seq 1 20); do
                    INGRESS_IP=$(kubectl get ingress chatbot-ingress -n ${NAMESPACE} \
                        -o jsonpath=\'{.status.loadBalancer.ingress[0].ip}\' 2>/dev/null)
                    if [ -n "$INGRESS_IP" ]; then
                        echo "  Ingress IP assigned: $INGRESS_IP"
                        break
                    fi
                    echo "  Waiting... ($i/20)"
                    sleep 3
                done

                # ── Vault: still needs one port-forward (no public route) ─────
                nohup kubectl port-forward service/vault 8200:8200 -n vault \
                    > /tmp/pf-vault.log 2>&1 &

                # ── ELK Kibana (Docker Compose — already on port 5601) ────────
                sleep 3

                # ── Pod summary ───────────────────────────────────────────────
                echo ""
                echo "  [Application Namespace: ${NAMESPACE}]"
                kubectl get pods -n ${NAMESPACE} -o wide
                echo ""
                echo "  [Monitoring Namespace: monitoring]"
                kubectl get pods -n monitoring -o wide
                echo ""
                echo "  [Ingress Resources]"
                kubectl get ingress -A

                # ════════════════════════════════════════════════════════════
                echo ""
                echo "##################################################################"
                echo "#                                                                #"
                echo "#   DEPLOYMENT SUCCESSFUL   Build #${BUILD_NUMBER}              #"
                echo "#   Nginx Ingress routing via chatbot.local                      #"
                echo "#                                                                #"
                echo "##################################################################"
                echo "#"
                echo "#  STEP 1 ── Run this once in a NEW terminal (needs sudo):      #"
                echo "#  $ sudo minikube tunnel                                        #"
                echo "#  Keep that terminal open. Then open the URLs below.            #"
                echo "#"
                echo "#  APPLICATION"
                echo "#  ──────────────────────────────────────────────────────────────"
                echo "#  Chatbot UI       →  http://chatbot.local/"
                echo "#  Backend API Docs →  http://chatbot.local/api/docs"
                echo "#"
                echo "#  OBSERVABILITY (K8s Ingress)"
                echo "#  ──────────────────────────────────────────────────────────────"
                echo "#  Grafana          →  http://chatbot.local/grafana/"
                echo "#  Prometheus       →  http://chatbot.local/prometheus/"
                echo "#"
                echo "#  LOGGING (Docker Compose — ELK)"
                echo "#  ──────────────────────────────────────────────────────────────"
                echo "#  Kibana           →  http://localhost:5601"
                echo "#"
                echo "#  SECRETS"
                echo "#  ──────────────────────────────────────────────────────────────"
                echo "#  Vault UI         →  http://localhost:8200  (token: root)"
                echo "#"
                echo "##################################################################"
                echo ""
            '''
        }
        failure {
            echo 'Pipeline failed. Check stage logs above.'
        }
    }
}
