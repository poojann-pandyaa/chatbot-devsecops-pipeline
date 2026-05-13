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
                script {
                    echo '================================================================'
                    echo '           TRIVY SECURITY SCAN - CHATBOT DEVSECOPS             '
                    echo '================================================================'

                    // ── Backend scan ──────────────────────────────────────────────
                    echo ''
                    echo '>>> Scanning: chatbot-backend'
                    def backendJson = sh(
                        script: "trivy image --exit-code 0 --severity HIGH,CRITICAL --no-progress --format json ${BACKEND_IMAGE}:${IMAGE_TAG} 2>/dev/null",
                        returnStdout: true
                    ).trim()

                    def backendReport = readJSON text: backendJson
                    int bCritical = 0
                    int bHigh     = 0
                    def bCVEs = []

                    backendReport.Results.each { result ->
                        result.Vulnerabilities?.each { v ->
                            if (v.Severity == 'CRITICAL') { bCritical++; bCVEs << "[CRITICAL] ${v.VulnerabilityID} - ${v.PkgName}: ${v.Title}" }
                            if (v.Severity == 'HIGH')     { bHigh++;     bCVEs << "[HIGH]     ${v.VulnerabilityID} - ${v.PkgName}: ${v.Title}" }
                        }
                    }

                    echo """\n┌─────────────────────────────────────────────┐
│  BACKEND IMAGE SCAN RESULTS                 │
│  Image : ${BACKEND_IMAGE}:${IMAGE_TAG}      │
│  🔴 CRITICAL : ${bCritical}                 │
│  🟠 HIGH     : ${bHigh}                     │
└─────────────────────────────────────────────┘"""

                    if (bCVEs) {
                        echo '\n--- Backend CVE Details ---'
                        bCVEs.each { echo it }
                    } else {
                        echo '✅ No HIGH/CRITICAL vulnerabilities found in backend!'
                    }

                    // ── Frontend scan ─────────────────────────────────────────────
                    echo ''
                    echo '>>> Scanning: chatbot-frontend'
                    def frontendJson = sh(
                        script: "trivy image --exit-code 0 --severity HIGH,CRITICAL --no-progress --format json ${FRONTEND_IMAGE}:${IMAGE_TAG} 2>/dev/null",
                        returnStdout: true
                    ).trim()

                    def frontendReport = readJSON text: frontendJson
                    int fCritical = 0
                    int fHigh     = 0
                    def fCVEs = []

                    frontendReport.Results.each { result ->
                        result.Vulnerabilities?.each { v ->
                            if (v.Severity == 'CRITICAL') { fCritical++; fCVEs << "[CRITICAL] ${v.VulnerabilityID} - ${v.PkgName}: ${v.Title}" }
                            if (v.Severity == 'HIGH')     { fHigh++;     fCVEs << "[HIGH]     ${v.VulnerabilityID} - ${v.PkgName}: ${v.Title}" }
                        }
                    }

                    echo """\n┌─────────────────────────────────────────────┐
│  FRONTEND IMAGE SCAN RESULTS                │
│  Image : ${FRONTEND_IMAGE}:${IMAGE_TAG}     │
│  🔴 CRITICAL : ${fCritical}                 │
│  🟠 HIGH     : ${fHigh}                     │
└─────────────────────────────────────────────┘"""

                    if (fCVEs) {
                        echo '\n--- Frontend CVE Details ---'
                        fCVEs.each { echo it }
                    } else {
                        echo '✅ No HIGH/CRITICAL vulnerabilities found in frontend!'
                    }

                    // ── Overall Summary ───────────────────────────────────────────
                    int totalCritical = bCritical + fCritical
                    int totalHigh     = bHigh + fHigh
                    int totalVulns    = totalCritical + totalHigh

                    echo """\n================================================================
  SECURITY SCAN SUMMARY
================================================================
  Backend  → CRITICAL: ${bCritical}  |  HIGH: ${bHigh}
  Frontend → CRITICAL: ${fCritical}  |  HIGH: ${fHigh}
  ──────────────────────────────────────────────────
  TOTAL    → CRITICAL: ${totalCritical}  |  HIGH: ${totalHigh}  |  TOTAL: ${totalVulns}
================================================================"""

                    if (totalCritical > 0) {
                        echo "⚠️  WARNING: ${totalCritical} CRITICAL vulnerabilities detected! Review before production."
                    } else {
                        echo "✅ No CRITICAL vulnerabilities found."
                    }
                }
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
                    ansible-playbook ansible/site.yml \\
                        --vault-password-file ${ANSIBLE_VAULT_PASS_FILE} \\
                        -e "backend_image=${BACKEND_IMAGE}:${IMAGE_TAG}" \\
                        -e "frontend_image=${FRONTEND_IMAGE}:${IMAGE_TAG}" \\
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
