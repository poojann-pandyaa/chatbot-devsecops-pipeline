pipeline {
    agent any

    environment {
        DOCKERHUB_USER          = 'poojannpandyaa'
        BACKEND_IMAGE           = "${DOCKERHUB_USER}/chatbot-backend"
        FRONTEND_IMAGE          = "${DOCKERHUB_USER}/chatbot-frontend"
        IMAGE_TAG               = "${BUILD_NUMBER}"
        ANSIBLE_VAULT_PASS_FILE = credentials('ansible-vault-pass')
        PATH                    = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${env.PATH}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
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

        stage('Security Scan') {
            steps {
                sh '''
                    echo "================================================================"
                    echo "        TRIVY SECURITY SCAN - CHATBOT DEVSECOPS               "
                    echo "================================================================"

                    # ── Backend scan ──────────────────────────────────────────────────
                    echo ""
                    echo ">>> Scanning: chatbot-backend"
                    trivy image --exit-code 0 \
                                --severity HIGH,CRITICAL \
                                --no-progress \
                                --format table \
                                ${BACKEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/backend_scan.txt || true

                    B_CRITICAL=$(grep -c "CRITICAL" /tmp/backend_scan.txt || echo 0)
                    B_HIGH=$(grep -c "HIGH" /tmp/backend_scan.txt || echo 0)

                    echo ""
                    echo "+-------------------------------------------------+"
                    echo "|   BACKEND IMAGE SCAN RESULTS                    |"
                    echo "|   Image : ${BACKEND_IMAGE}:${IMAGE_TAG}         |"
                    printf "|   CRITICAL : %-3s                              |\n" "$B_CRITICAL"
                    printf "|   HIGH     : %-3s                              |\n" "$B_HIGH"
                    echo "+-------------------------------------------------+"

                    echo ""
                    echo "--- Backend CVE Details ---"
                    grep -E "(CRITICAL|HIGH)" /tmp/backend_scan.txt | grep -v "^\\s*$" || echo "No HIGH/CRITICAL found in backend."

                    # ── Frontend scan ─────────────────────────────────────────────────
                    echo ""
                    echo ">>> Scanning: chatbot-frontend"
                    trivy image --exit-code 0 \
                                --severity HIGH,CRITICAL \
                                --no-progress \
                                --format table \
                                ${FRONTEND_IMAGE}:${IMAGE_TAG} 2>/dev/null > /tmp/frontend_scan.txt || true

                    F_CRITICAL=$(grep -c "CRITICAL" /tmp/frontend_scan.txt || echo 0)
                    F_HIGH=$(grep -c "HIGH" /tmp/frontend_scan.txt || echo 0)

                    echo ""
                    echo "+-------------------------------------------------+"
                    echo "|   FRONTEND IMAGE SCAN RESULTS                   |"
                    echo "|   Image : ${FRONTEND_IMAGE}:${IMAGE_TAG}        |"
                    printf "|   CRITICAL : %-3s                              |\n" "$F_CRITICAL"
                    printf "|   HIGH     : %-3s                              |\n" "$F_HIGH"
                    echo "+-------------------------------------------------+"

                    echo ""
                    echo "--- Frontend CVE Details (first 20 lines) ---"
                    grep -E "(CRITICAL|HIGH)" /tmp/frontend_scan.txt | head -20 || echo "No HIGH/CRITICAL found in frontend."

                    # ── Overall Summary ───────────────────────────────────────────────
                    TOTAL_CRITICAL=$((B_CRITICAL + F_CRITICAL))
                    TOTAL_HIGH=$((B_HIGH + F_HIGH))
                    TOTAL=$((TOTAL_CRITICAL + TOTAL_HIGH))

                    echo ""
                    echo "================================================================"
                    echo "  SECURITY SCAN SUMMARY"
                    echo "================================================================"
                    printf "  Backend  -> CRITICAL: %-3s | HIGH: %s\n" "$B_CRITICAL" "$B_HIGH"
                    printf "  Frontend -> CRITICAL: %-3s | HIGH: %s\n" "$F_CRITICAL" "$F_HIGH"
                    echo "  ------------------------------------------------"
                    printf "  TOTAL    -> CRITICAL: %-3s | HIGH: %-3s | TOTAL: %s\n" "$TOTAL_CRITICAL" "$TOTAL_HIGH" "$TOTAL"
                    echo "================================================================"

                    if [ "$TOTAL_CRITICAL" -gt 0 ]; then
                        echo "WARNING: $TOTAL_CRITICAL CRITICAL vulnerabilities detected! Review before production."
                    else
                        echo "OK: No CRITICAL vulnerabilities found."
                    fi
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
                    kubectl get pods -n chatbot-prod
                    kubectl rollout status deployment/chatbot-backend -n chatbot-prod --timeout=120s
                '''
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully.'
        }
        failure {
            echo 'Pipeline failed. Check logs above.'
        }
    }
}
