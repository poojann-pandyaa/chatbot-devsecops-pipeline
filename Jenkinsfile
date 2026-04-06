pipeline {
    agent any
    tools {
        jdk 'jdk17'
        nodejs 'node20'
    }
    environment {
        SCANNER_HOME = tool 'sonar-scanner'
        IMAGE_NAME   = "poojannpandyaa/chatbot"
    }
    stages {
        stage('Checkout SCM') {
            steps { checkout scm }
        }
        stage('Install Dependencies') {
            steps { sh 'cd app && npm install' }
        }
        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('sonar-server') {
                    sh '''$SCANNER_HOME/bin/sonar-scanner \
                        -Dsonar.projectName=Chatbot \
                        -Dsonar.projectKey=Chatbot'''
                }
            }
        }
        stage('quality gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: false
                }
            }
        }
        stage('OWASP FS SCAN') {
            steps {
                dependencyCheck additionalArguments: '--scan ./ --format HTML', odcInstallation: 'DP-Check'
                dependencyCheckPublisher pattern: '**/dependency-check-report.html'
            }
        }
        stage('TRIVY FS SCAN') {
            steps {
                sh 'trivy fs . > trivyfs.txt'
            }
        }
        stage('Docker Build & Push') {
            steps {
                withDockerRegistry(credentialsId: 'docker-cred', url: 'https://index.docker.io/v1/') {
                    sh '''
                        docker buildx build \
                          --platform linux/amd64,linux/arm64 \
                          -t ${IMAGE_NAME}:latest \
                          --push app/
                    '''
                }
            }
        }
        stage('TRIVY') {
            steps {
                sh 'trivy image ${IMAGE_NAME}:latest > trivyimage.txt'
            }
        }
        stage('Remove container') {
            steps {
                sh 'docker stop chatbot || true && docker rm chatbot || true'
            }
        }
        stage('Deploy to container') {
            steps {
                sh 'docker run -d --name chatbot -p 3000:3000 ${IMAGE_NAME}:latest'
            }
        }
        stage('Deploy to kubernetes') {
            steps {
                sh 'kubectl apply -f k8s/chatbot-ui.yaml'
            }
        }
    }
}
